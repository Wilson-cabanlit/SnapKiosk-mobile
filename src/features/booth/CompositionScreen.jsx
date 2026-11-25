import React, {useEffect, useState} from 'react';
import {Image, Linking, Platform, ScrollView, StyleSheet, Switch, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import PrimaryButton from '../../components/PrimaryButton';
import {composeSession, FILTERS} from '../../services/composition/composer';
import {loadDeviceConfig} from '../../services/deviceConfig';
import {listSessions, transitionSession, upsertSession} from '../../services/sessionRepository';
import {enqueuePrintJob, printQueuedJob, removePrintJob} from '../../services/printer/printQueue';
import {deliverConsentedSession} from '../../services/digitalDelivery';
import {activatePendingIfIdle} from '../../services/eventSync';

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
  const [shareDigitalCopy, setShareDigitalCopy] = useState(false);
  const [deliveryConsentAt, setDeliveryConsentAt] = useState(null);
  const [delivery, setDelivery] = useState(null);

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
          const printRecord = {id: job.id, status: job.status, copies, createdAt: job.createdAt};
          await upsertSession({...printing, ...(shareDigitalCopy && deliveryConsentAt ? {digitalDeliveryConsentAt: deliveryConsentAt} : {}), printJobs: [...printing.printJobs, printRecord]});
      savedInSession = true;
      if (Platform.OS === 'android' && config.printer.selectedPrinter?.address) {
        try {
          const sentJob = await printQueuedJob(job.id);
          setMessage(`Print data sent to ${config.printer.selectedPrinter.name || 'the selected printer'}. Check the printer output.`);
          if (shareDigitalCopy && deliveryConsentAt) {
            try {
              const latest = (await listSessions()).find(item => item.id === sessionId);
              const delivered = await deliverConsentedSession({...latest, printJobs: [...latest.printJobs.filter(item => item.id !== job.id), {id: job.id, status: sentJob.status, copies, createdAt: job.createdAt}]});
              setDelivery(delivered);
              setMessage('Your print layout, receipt image, and animated GIF are ready in the private gallery.');
            } catch (deliveryError) {
              const latest = (await listSessions()).find(item => item.id === sessionId);
              await upsertSession({...latest, uploadStatus: 'failed'}).catch(() => {});
              setError(`The receipt printed, but digital delivery could not finish: ${deliveryError?.message || 'Check the backend and kiosk event assignment.'}`);
            }
          }
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
      let complete = session;
      while (complete.status !== 'complete' && complete.status !== 'cancelled') {
        const next = {consent: 'layout', layout: 'capture', capture: 'review', review: 'compose', compose: 'print', print: 'delivery', delivery: 'complete'}[complete.status];
        if (!next) throw new Error(`This session cannot be finished from ${complete.status}.`);
        complete = transitionSession(complete, next);
      }
      await upsertSession(complete);
      await activatePendingIfIdle().catch(() => {});
      navigation.popToTop();
    } catch (finishError) {setError(finishError?.message || 'Could not finish this session.');}
    finally {setBusy(false);}
  };

  const printAreaRatio = config ? Math.min(1, config.printer.printableDots / (config.printer.paperWidthMm * 8)) : 1;
  const deliveryMessage = !config || config.backend?.mode === 'standalone'
    ? 'Standalone offline mode is active. Preview, local session history, and thermal printing work on this kiosk; digital delivery is disabled.'
    : config.backend?.connectionStatus === 'connected'
      ? 'The API and gallery are reachable. Pair this kiosk and assign it to an event to enable verified guest downloads after printing.'
      : config.backend?.continueOffline !== false
        ? 'The backend is currently unavailable. You can continue with local preview, session history, and printing. No upload or QR link is created.'
        : 'The backend is unavailable and offline continuation is disabled. This saved session can still be previewed and printed locally.';
  const printPreviewHeight = 360;
  const printPreviewWidth = result ? printPreviewHeight * result.thermalWidth / result.thermalHeight : 0;
  const paperPreviewWidth = printAreaRatio > 0 ? printPreviewWidth / printAreaRatio : printPreviewWidth;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>PHOTO REVIEW</Text>
        <Text style={styles.title}>Your composition</Text>
        <Text style={styles.description}>Choose a digital filter. The downloadable color image and animated GIF use the selected print layout; the receipt is rendered separately for thermal printing.</Text>
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
        <View style={styles.deliveryCard}><Text style={styles.previewLabel}>DIGITAL DELIVERY</Text><Text style={styles.description}>{deliveryMessage}</Text></View>
        {config?.backend?.mode !== 'standalone' ? <View style={styles.consentCard}><View style={styles.consentCopy}><Text style={styles.copyLabel}>Share a digital copy</Text><Text style={styles.description}>After the receipt prints, upload the color layout and receipt image to this event’s private guest gallery. A QR link appears only after both uploads are verified.</Text></View><Switch value={shareDigitalCopy} disabled={Boolean(delivery)} onValueChange={value => {const consentAt = value ? new Date().toISOString() : null;setShareDigitalCopy(value);setDeliveryConsentAt(consentAt);if (sessionId) listSessions().then(sessions => {const session = sessions.find(item => item.id === sessionId);if (session) upsertSession({...session, digitalDeliveryConsentAt: consentAt});}).catch(() => {});}} accessibilityLabel="Consent to digital photo delivery" /></View> : null}
        {delivery?.downloadUrl ? <View style={styles.downloadCard}>
          <Text style={styles.previewLabel}>YOUR PRIVATE DOWNLOAD LINK</Text>
          <Text style={styles.description}>Scan this QR code on your phone to download the print-matched digital layout, animated GIF, and receipt image.</Text>
          <View style={styles.qrWrap}><QRCode value={delivery.downloadUrl} size={220} backgroundColor="#FFFCF7" color="#26241F" /></View>
          <Text selectable style={styles.downloadUrl}>{delivery.downloadUrl}</Text>
          {delivery.deliveryExpiresAt ? <Text style={styles.description}>Available until {new Date(delivery.deliveryExpiresAt).toLocaleDateString()}.</Text> : null}
          <Text onPress={() => Linking.openURL(delivery.downloadUrl)} style={styles.openLink}>Open guest gallery</Text>
        </View> : null}
        {config ? <View style={styles.copyRow}><Text style={styles.copyLabel}>Print copies</Text><View style={styles.copyControls}><Text onPress={() => setCopies(value => Math.max(1, value - 1))} style={styles.stepper}>−</Text><Text style={styles.copyValue}>{copies}</Text><Text onPress={() => setCopies(value => Math.min(10, value + 1))} style={styles.stepper}>+</Text></View></View> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <PrimaryButton title={busy ? 'Working…' : config?.printer?.selectedPrinter?.address ? 'Print and prepare guest QR' : 'Save print request to queue'} onPress={queuePrint} disabled={!result || !config || busy} loading={busy} style={styles.primary} />
        <PrimaryButton title="Finish and return to welcome" onPress={finishSession} disabled={!result || busy} style={styles.secondary} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({safe: {flex: 1, backgroundColor: '#F6F0E6'}, content: {width: '100%', maxWidth: 1100, alignSelf: 'center', padding: 24, paddingBottom: 42, gap: 14}, kicker: {fontSize: 11, letterSpacing: 2, color: '#77736A', fontWeight: '700'}, title: {fontFamily: 'Georgia', fontSize: 38, color: '#26241F'}, description: {fontSize: 14, lineHeight: 21, color: '#77736A'}, filters: {gap: 8, paddingVertical: 2}, filter: {paddingHorizontal: 15, paddingVertical: 10, borderRadius: 18, backgroundColor: '#FFFCF7', color: '#26241F', fontSize: 14, borderWidth: 1, borderColor: '#E8E0D4'}, filterActive: {backgroundColor: '#D8E0D5', borderColor: '#82958C', fontWeight: '700'}, loading: {minHeight: 180, alignItems: 'center', justifyContent: 'center'}, previews: {flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start'}, previewCard: {flexGrow: 1, flexBasis: 300, backgroundColor: '#FFFCF7', borderColor: '#E8E0D4', borderWidth: 1, borderRadius: 16, padding: 12, gap: 10}, previewLabel: {fontSize: 10, color: '#77736A', fontWeight: '800', letterSpacing: 1.2}, digitalPreview: {width: '100%', height: 360, backgroundColor: '#F6F0E6', borderRadius: 8}, thermalPaper: {alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: 4, flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center', overflow: 'hidden', borderColor: '#E8E0D4', borderWidth: 1}, deliveryCard: {backgroundColor: '#F2E7DB', borderRadius: 14, padding: 16, gap: 7}, consentCard: {flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFCF7', borderRadius: 14, padding: 16, borderColor: '#E8E0D4', borderWidth: 1}, consentCopy: {flex: 1, gap: 6}, downloadCard: {alignItems: 'center', backgroundColor: '#FFFCF7', borderRadius: 16, padding: 20, gap: 12, borderColor: '#82958C', borderWidth: 1}, qrWrap: {padding: 14, backgroundColor: '#FFFCF7'}, downloadUrl: {fontSize: 13, textAlign: 'center', color: '#4C5F57'}, openLink: {fontSize: 15, color: '#4C5F57', padding: 10, fontWeight: '700'}, copyRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFCF7', borderRadius: 14, paddingHorizontal: 16, minHeight: 58}, copyLabel: {fontSize: 15, fontWeight: '700', color: '#26241F'}, copyControls: {flexDirection: 'row', alignItems: 'center', gap: 18}, stepper: {fontSize: 24, color: '#4C5F57', paddingHorizontal: 6}, copyValue: {fontSize: 18, fontWeight: '800', color: '#26241F'}, error: {fontSize: 14, color: '#9D4235'}, message: {fontSize: 14, color: '#4C5F57'}, primary: {minHeight: 56, marginTop: 4}, secondary: {minHeight: 52, backgroundColor: '#D8D0C3'}});
