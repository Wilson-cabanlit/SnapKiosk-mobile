import React, {useEffect, useState} from 'react';
import {Image, Platform, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import PrimaryButton from '../../components/PrimaryButton';
import {composeSession, FILTERS} from '../../services/composition/composer';
import {loadDeviceConfig} from '../../services/deviceConfig';
import {listSessions, transitionSession, upsertSession} from '../../services/sessionRepository';
import {enqueuePrintJob, printQueuedJob, removePrintJob} from '../../services/printer/printQueue';

const fileUri = path => path?.startsWith('file://') ? path : `file://${path}`;

export default function CompositionScreen({navigation, route}) {
  const {sessionId} = route.params || {};
  const [filterId, setFilterId] = useState('original');
  const [result, setResult] = useState(null);
  const [config, setConfig] = useState(null);
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {loadDeviceConfig().then(setConfig).catch(loadError => setError(loadError?.message || 'Could not load printer settings.'));}, []);
  useEffect(() => {
    let active = true;
    setBusy(true); setError(''); setMessage('');
    composeSession(sessionId, filterId)
      .then(composed => {if (active) setResult(composed);})
      .catch(composeError => {if (active) setError(composeError?.message || 'Could not create the photo composition.');})
      .finally(() => {if (active) setBusy(false);});
    return () => {active = false;};
  }, [filterId, sessionId]);

  const queuePrint = async () => {
    if (!result || !config) return;
    setBusy(true); setError(''); setMessage('');
    let job;
    let savedInSession = false;
    try {
      const session = (await listSessions()).find(item => item.id === sessionId);
      if (!session) throw new Error('The local session record could not be found.');
      job = await enqueuePrintJob({
        sessionId,
        imagePath: result.thermalPath,
        copies,
        paperWidthMm: config.printer.paperWidthMm,
        printableDots: result.thermalWidth,
        printOptions: {feedLines: config.printer.feedLines, cutAfterPrint: config.printer.cutAfterPrint},
      });
      const printing = session.status === 'compose' ? transitionSession(session, 'print') : session;
      await upsertSession({...printing, printJobs: [...printing.printJobs, {id: job.id, status: job.status, copies, createdAt: job.createdAt}]});
      savedInSession = true;
      if (Platform.OS === 'android' && config.printer.selectedPrinter?.address) {
        try {
          await printQueuedJob(job.id);
          setMessage(`Print data sent to ${config.printer.selectedPrinter.name || 'the selected printer'}. Check the printer output.`);
        } catch (printError) {
          setError(`Request is saved in the queue, but could not be sent: ${printError?.message || 'Check the printer connection.'}`);
        }
      } else {
        setMessage('Print request saved in the queue. Connect a printer in administrator settings, then send it from Print queue.');
      }
    } catch (queueError) {
      if (job && !savedInSession) await removePrintJob(job.id).catch(() => {});
      setError(queueError?.message || 'Could not add the print job to the queue.');
    }
    finally {setBusy(false);}
  };

  const finishSession = async () => {
    if (!result) return;
    setBusy(true); setError('');
    try {
      const session = (await listSessions()).find(item => item.id === sessionId);
      if (!session) throw new Error('The local session record could not be found.');
      const complete = transitionSession(session, 'complete');
      await upsertSession(complete);
      navigation.popToTop();
    } catch (finishError) {setError(finishError?.message || 'Could not finish this session.');}
    finally {setBusy(false);}
  };

  const printAreaRatio = config ? Math.min(1, config.printer.printableDots / (config.printer.paperWidthMm * 8)) : 1;
  const printPreviewHeight = 360;
  const printPreviewWidth = result ? printPreviewHeight * result.thermalWidth / result.thermalHeight : 0;
  const paperPreviewWidth = printAreaRatio > 0 ? printPreviewWidth / printAreaRatio : printPreviewWidth;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>PHOTO REVIEW</Text>
        <Text style={styles.title}>Your composition</Text>
        <Text style={styles.description}>Choose a digital filter. Originals stay unchanged; the thermal print is rendered separately in monochrome.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map(filter => <Text key={filter.id} onPress={() => setFilterId(filter.id)} style={[styles.filter, filterId === filter.id && styles.filterActive]}>{filter.name}</Text>)}
        </ScrollView>
        {busy && !result ? <View style={styles.loading}><Text style={styles.description}>Composing your photos…</Text></View> : null}
        {result ? (
          <View style={styles.previews}>
            <View style={styles.previewCard}>
              <Text style={styles.previewLabel}>DIGITAL COMPOSITION · {result.template.photoSlots.length} {result.template.photoSlots.length === 1 ? 'PHOTO' : 'PHOTOS'}</Text>
              <Image source={{uri: fileUri(result.digitalPath)}} style={styles.digitalPreview} resizeMode="contain" />
            </View>
            <View style={styles.previewCard}>
              <Text style={styles.previewLabel}>THERMAL PREVIEW · {result.thermalWidth} DOTS · {result.template.photoSlots.length} {result.template.photoSlots.length === 1 ? 'PHOTO' : 'PHOTOS'}</Text>
              <View style={[styles.thermalPaper, {width: paperPreviewWidth, height: printPreviewHeight}]}>
                <Image source={{uri: fileUri(result.thermalPath)}} style={{width: printPreviewWidth, height: printPreviewHeight}} resizeMode="stretch" />
              </View>
            </View>
          </View>
        ) : null}
        <View style={styles.deliveryCard}><Text style={styles.previewLabel}>DIGITAL DELIVERY</Text><Text style={styles.description}>Private upload and QR delivery are not connected yet. No download link will be shown until the backend confirms the file is available.</Text></View>
        {config ? <View style={styles.copyRow}><Text style={styles.copyLabel}>Print copies</Text><View style={styles.copyControls}><Text onPress={() => setCopies(value => Math.max(1, value - 1))} style={styles.stepper}>−</Text><Text style={styles.copyValue}>{copies}</Text><Text onPress={() => setCopies(value => Math.min(10, value + 1))} style={styles.stepper}>+</Text></View></View> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <PrimaryButton title={busy ? 'Working…' : 'Save print request to queue'} onPress={queuePrint} disabled={!result || !config || busy} loading={busy} style={styles.primary} />
        <PrimaryButton title="Finish and return to welcome" onPress={finishSession} disabled={!result || busy} style={styles.secondary} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({safe: {flex: 1, backgroundColor: '#F6F0E6'}, content: {width: '100%', maxWidth: 1100, alignSelf: 'center', padding: 24, paddingBottom: 42, gap: 14}, kicker: {fontSize: 11, letterSpacing: 2, color: '#77736A', fontWeight: '700'}, title: {fontFamily: 'Georgia', fontSize: 38, color: '#26241F'}, description: {fontSize: 14, lineHeight: 21, color: '#77736A'}, filters: {gap: 8, paddingVertical: 2}, filter: {paddingHorizontal: 15, paddingVertical: 10, borderRadius: 18, backgroundColor: '#FFFCF7', color: '#26241F', fontSize: 14, borderWidth: 1, borderColor: '#E8E0D4'}, filterActive: {backgroundColor: '#D8E0D5', borderColor: '#82958C', fontWeight: '700'}, loading: {minHeight: 180, alignItems: 'center', justifyContent: 'center'}, previews: {flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start'}, previewCard: {flexGrow: 1, flexBasis: 300, backgroundColor: '#FFFCF7', borderColor: '#E8E0D4', borderWidth: 1, borderRadius: 16, padding: 12, gap: 10}, previewLabel: {fontSize: 10, color: '#77736A', fontWeight: '800', letterSpacing: 1.2}, digitalPreview: {width: '100%', height: 360, backgroundColor: '#F6F0E6', borderRadius: 8}, thermalPaper: {alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: 4, flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center', overflow: 'hidden', borderColor: '#E8E0D4', borderWidth: 1}, deliveryCard: {backgroundColor: '#F2E7DB', borderRadius: 14, padding: 16, gap: 7}, copyRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFCF7', borderRadius: 14, paddingHorizontal: 16, minHeight: 58}, copyLabel: {fontSize: 15, fontWeight: '700', color: '#26241F'}, copyControls: {flexDirection: 'row', alignItems: 'center', gap: 18}, stepper: {fontSize: 24, color: '#4C5F57', paddingHorizontal: 6}, copyValue: {fontSize: 18, fontWeight: '800', color: '#26241F'}, error: {fontSize: 14, color: '#9D4235'}, message: {fontSize: 14, color: '#4C5F57'}, primary: {minHeight: 56, marginTop: 4}, secondary: {minHeight: 52, backgroundColor: '#D8D0C3'}});
