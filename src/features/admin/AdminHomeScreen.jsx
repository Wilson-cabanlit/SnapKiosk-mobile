import React, {useCallback, useState} from 'react';
import {ScrollView, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useDispatch, useSelector} from 'react-redux';
import PrimaryButton from '../../components/PrimaryButton';
import {lockAdmin} from '../../store/settingsSlice';
import {loadDeviceConfig} from '../../services/deviceConfig';
import {listPrintJobs} from '../../services/printer/printQueue';
import {listSessions} from '../../services/sessionRepository';

export default function AdminHomeScreen({navigation}) {
  const dispatch = useDispatch();
  const brand = useSelector(state => state.settings.brand);
  const {width} = useWindowDimensions();
  const [metrics, setMetrics] = useState({sessions: 0, active: 0, pending: 0, backendMode: 'standalone', backendStatus: 'standalone'});
  const [loadError, setLoadError] = useState('');
  const columns = width > 850 ? 2 : 1;
  const backendStatusLabel = {connected: 'Connected', partial: 'Partially connected', disconnected: 'Disconnected', 'not-tested': 'Not tested', standalone: 'Standalone offline'}[metrics.backendMode === 'standalone' ? 'standalone' : metrics.backendStatus] || 'Not tested';
  const signOut = () => {dispatch(lockAdmin()); navigation.popToTop();};

  const refreshMetrics = useCallback(async () => {
    try {
      const [sessions, jobs, config] = await Promise.all([listSessions(), listPrintJobs(), loadDeviceConfig()]);
      setMetrics({
        sessions: sessions.length,
        active: sessions.filter(session => !['complete', 'cancelled'].includes(session.status)).length,
        pending: jobs.filter(job => ['queued', 'printing', 'failed'].includes(job.status)).length,
        backendMode: config.backend?.mode || 'standalone',
        backendStatus: config.backend?.connectionStatus || 'not-tested',
      });
      setLoadError('');
    } catch (error) {setLoadError(error?.message || 'Could not load dashboard metrics.');}
  }, []);
  useFocusEffect(useCallback(() => {refreshMetrics();}, [refreshMetrics]));

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View><Text style={styles.kicker}>SNAPKIOSK SETTINGS</Text><Text style={styles.title}>Kiosk settings</Text></View>
          <PrimaryButton title="Lock admin" onPress={signOut} style={styles.lock} />
        </View>
        <Text style={styles.section}>System overview</Text>
        <View style={[styles.grid, columns === 2 && styles.twoCol]}>
          <View style={[styles.status, styles.wide]}><Text style={styles.label}>KIOSK SETUP</Text><Text style={styles.value}>Configuration ready</Text><Text style={styles.note}>Capture, layouts, composition, history, and printing run locally. Pair this kiosk with an assigned event to upload the digital layout and receipt image and show a private guest QR link after printing.</Text></View>
          <View style={styles.status}><Text style={styles.label}>BUSINESS</Text><Text style={styles.value}>{brand.businessName}</Text><Text style={styles.note}>{brand.eventName || 'No active event profile'}</Text></View>
          <View style={styles.status}><Text style={styles.label}>SESSIONS</Text><Text style={styles.value}>{metrics.sessions} total · {metrics.active} active</Text><Text style={styles.note}>Session metadata stored on this kiosk.</Text></View>
          <View style={styles.status}><Text style={styles.label}>PRINT QUEUE</Text><Text style={styles.value}>{metrics.pending} pending</Text><Text style={styles.note}>Printer transport is still required to print jobs.</Text></View>
          <View style={styles.status}><Text style={styles.label}>BACKEND</Text><Text style={styles.value}>{backendStatusLabel}</Text><Text style={styles.note}>{metrics.backendMode === 'local' ? 'Local server mode' : metrics.backendMode === 'online' ? 'Online server mode' : 'API and gallery are disabled.'}</Text></View>
        </View>
        {loadError ? <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text> : null}
        <Text style={styles.section}>Setup and management</Text>
        <PrimaryButton title="Edit branding and event profile" onPress={() => navigation.navigate('BrandSettings')} style={styles.settingsButton} />
        <PrimaryButton title="Manage photo templates" onPress={() => navigation.navigate('Templates')} style={styles.settingsButton} />
        <PrimaryButton title="Customize print layout" onPress={() => navigation.navigate('PrintLayoutEditor')} style={styles.settingsButton} />
        <PrimaryButton title="Configure printer profile" onPress={() => navigation.navigate('PrinterSettings')} style={styles.settingsButton} />
        <PrimaryButton title="Configure backend connection" onPress={() => navigation.navigate('DeliverySettings')} style={styles.settingsButton} />
        <PrimaryButton title="Set customer workflow" onPress={() => navigation.navigate('WorkflowSettings')} style={styles.settingsButton} />
        <PrimaryButton title="View session history" onPress={() => navigation.navigate('SessionHistory')} style={styles.settingsButton} />
        <PrimaryButton title="Manage print queue" onPress={() => navigation.navigate('PrintQueue')} style={styles.settingsButton} />
        <PrimaryButton title="Return to customer welcome" onPress={() => {dispatch(lockAdmin()); navigation.popToTop();}} style={styles.returnButton} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({safe: {flex: 1, backgroundColor: '#F6F0E6'}, content: {padding: 28, gap: 18, maxWidth: 1200, width: '100%', alignSelf: 'center'}, header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}, kicker: {fontSize: 11, letterSpacing: 2, color: '#77736A', fontWeight: '700'}, title: {fontFamily: 'Georgia', fontSize: 40, color: '#26241F', marginTop: 8}, lock: {minHeight: 52, minWidth: 120, backgroundColor: '#D8D0C3'}, section: {fontSize: 19, color: '#26241F', fontWeight: '700', marginTop: 8}, settingsButton: {alignSelf: 'flex-start', minHeight: 54}, grid: {gap: 14}, twoCol: {flexDirection: 'row', flexWrap: 'wrap'}, status: {flexGrow: 1, flexBasis: 230, borderRadius: 20, backgroundColor: '#FFFCF7', padding: 20, minHeight: 150, borderWidth: 1, borderColor: '#E8E0D4'}, wide: {flexBasis: 380}, label: {fontSize: 11, fontWeight: '700', letterSpacing: 1.6, color: '#77736A'}, value: {fontSize: 22, fontWeight: '700', color: '#26241F', marginTop: 14}, note: {fontSize: 14, lineHeight: 21, color: '#77736A', marginTop: 7}, error: {fontSize: 13, color: '#9D4235'}, returnButton: {alignSelf: 'flex-start', marginTop: 10}});
