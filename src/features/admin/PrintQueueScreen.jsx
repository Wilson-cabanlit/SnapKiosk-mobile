import React, {useCallback, useState} from 'react';
import {Alert, Linking, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import PrimaryButton from '../../components/PrimaryButton';
import {createReprintJob, listPrintJobs, printQueuedJob, removePrintJob, retryPrintJob} from '../../services/printer/printQueue';
import {listSessions} from '../../services/sessionRepository';
import {deliverConsentedSession} from '../../services/digitalDelivery';

export default function PrintQueueScreen() {
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sendingId, setSendingId] = useState('');
  const [delivery, setDelivery] = useState(null);
  const refresh = useCallback(async () => {
    try {setJobs(await listPrintJobs()); setError('');}
    catch (loadError) {setError(loadError?.message || 'Could not read the local print queue.');}
  }, []);
  useFocusEffect(useCallback(() => {refresh();}, [refresh]));

  const remove = job => Alert.alert('Remove print record?', `Job ${job.id} will be removed from this device.`, [
    {text: 'Cancel', style: 'cancel'},
    {text: 'Remove', style: 'destructive', onPress: async () => {await removePrintJob(job.id); refresh();}},
  ]);

  const reprint = async job => {
    try {await createReprintJob(job.id); refresh();}
    catch (createError) {setError(createError?.message || 'Could not create a reprint job.');}
  };

  const retry = async job => {
    try {await retryPrintJob(job.id); refresh();}
    catch (retryError) {setError(retryError?.message || 'Could not retry this job.');}
  };

  const printNow = async job => {
    setSendingId(job.id); setError(''); setMessage('');
    try {
      await printQueuedJob(job.id);
      setMessage(`Print data sent for job ${job.id}. Check the printer output.`);
      const session = (await listSessions()).find(item => item.id === job.sessionId);
      if (session?.digitalDeliveryConsentAt) {
        try {
          const ready = await deliverConsentedSession(session);
          setDelivery({url: ready.downloadUrl, expiresAt: ready.deliveryExpiresAt});
          setMessage('Receipt data was sent, and the customer’s private guest QR link is ready.');
        } catch (deliveryError) {setError(`Print data was sent, but digital delivery could not finish: ${deliveryError?.message || 'Check the event and connection.'}`);}
      }
      await refresh();
    } catch (printError) {
      setError(printError?.message || 'Could not send this job to the printer.');
      await refresh();
    } finally {setSendingId('');}
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>LOCAL PRINT JOBS</Text>
        <Text style={styles.title}>Print queue</Text>
        <Text style={styles.description}>Jobs are saved on this device. Send queued jobs to the selected Android Bluetooth Classic ESC/POS printer.</Text>
        <View style={styles.statusCard}><Text style={styles.statusTitle}>Printer output</Text><Text style={styles.description}>The app records when receipt data is sent. Confirm the paper output at the printer.</Text></View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {delivery?.url ? <View style={styles.deliveryCard}><Text style={styles.jobTitle}>PRIVATE GUEST DOWNLOAD</Text><Text style={styles.description}>Scan this QR code to open the gallery with the digital composition and receipt image.</Text><View style={styles.qrWrap}><QRCode value={delivery.url} size={220} backgroundColor="#FFFCF7" color="#26241F" /></View><Text selectable style={styles.link}>{delivery.url}</Text>{delivery.expiresAt ? <Text style={styles.meta}>Available until {new Date(delivery.expiresAt).toLocaleDateString()}.</Text> : null}<Text onPress={() => Linking.openURL(delivery.url)} style={styles.action}>Open guest gallery</Text></View> : null}
        {jobs.length === 0 ? <View style={styles.card}><Text style={styles.jobTitle}>Queue is empty</Text><Text style={styles.description}>A print job will appear after a photo session has a composed print image.</Text></View> : jobs.map(job => (
          <View key={job.id} style={styles.card}>
            <View style={styles.row}><Text style={styles.jobTitle}>{job.status === 'sent' ? 'SENT TO PRINTER' : job.status.toUpperCase()}</Text><Text style={styles.count}>{job.copies} {job.copies === 1 ? 'copy' : 'copies'}</Text></View>
            <Text style={styles.meta}>Session: {job.sessionId}</Text>
            <Text style={styles.meta}>{job.paperWidthMm} mm · {job.printableDots} dots · {job.attemptCount} attempts</Text>
            <Text style={styles.meta}>Created: {new Date(job.createdAt).toLocaleString()}</Text>
            {job.lastError ? <Text style={styles.error}>{job.lastError}</Text> : null}
            <View style={styles.actions}>
              {job.status === 'failed' ? <Text onPress={() => retry(job)} style={styles.action}>Retry</Text> : null}
              {job.status === 'queued' ? <Text onPress={() => printNow(job)} style={styles.action}>{sendingId === job.id ? 'Sending…' : 'Print now'}</Text> : null}
              {job.status === 'sent' ? <Text onPress={() => reprint(job)} style={styles.action}>Create reprint job</Text> : null}
              <Text onPress={() => remove(job)} style={styles.remove}>Remove record</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({safe: {flex: 1, backgroundColor: '#F6F0E6'}, content: {flex: 1, width: '100%', maxWidth: 1000, alignSelf: 'center', padding: 28, paddingBottom: 48, gap: 14}, kicker: {fontSize: 11, letterSpacing: 2, color: '#77736A', fontWeight: '700'}, title: {fontFamily: 'Georgia', fontSize: 38, color: '#26241F'}, description: {fontSize: 14, lineHeight: 21, color: '#77736A'}, statusCard: {backgroundColor: '#F2E7DB', borderRadius: 16, padding: 18, gap: 6}, statusTitle: {fontSize: 18, fontWeight: '700', color: '#9D4235'}, card: {backgroundColor: '#FFFCF7', borderColor: '#E8E0D4', borderWidth: 1, borderRadius: 16, padding: 18, gap: 8}, row: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}, jobTitle: {fontSize: 16, color: '#26241F', fontWeight: '800', letterSpacing: 0.5}, count: {fontSize: 14, color: '#77736A'}, meta: {fontSize: 12, color: '#77736A'}, actions: {flexDirection: 'row', justifyContent: 'space-between', gap: 16, marginTop: 4}, action: {fontSize: 14, fontWeight: '700', color: '#4C5F57', padding: 8}, remove: {fontSize: 13, color: '#9D4235', fontWeight: '700', padding: 8}, error: {fontSize: 13, color: '#9D4235'}, message: {fontSize: 13, color: '#4C5F57'}, deliveryCard: {alignItems: 'center', backgroundColor: '#FFFCF7', borderColor: '#82958C', borderWidth: 1, borderRadius: 16, padding: 20, gap: 12}, qrWrap: {padding: 14}, link: {fontSize: 13, textAlign: 'center', color: '#4C5F57'}});
