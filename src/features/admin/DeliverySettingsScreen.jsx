import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, Switch, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import PrimaryButton from '../../components/PrimaryButton';
import {loadDeviceConfig, saveDeviceConfig, validateApiBaseUrl} from '../../services/deviceConfig';

export default function DeliverySettingsScreen() {
  const [config, setConfig] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {loadDeviceConfig().then(setConfig).catch(error => setMessage(error?.message || 'Could not load delivery settings.'));}, []);
  const update = patch => setConfig(current => ({...current, delivery: {...current.delivery, ...patch}}));

  const save = async () => {
    const validation = validateApiBaseUrl(config.delivery.apiBaseUrl.trim());
    if (validation) {setMessage(validation); return;}
    if (config.delivery.enabled && !config.delivery.apiBaseUrl.trim()) {setMessage('Add the backend URL before enabling digital delivery.'); return;}
    setSaving(true); setMessage('');
    try {await saveDeviceConfig(config); setMessage('Delivery settings saved. Uploads remain disabled until a backend implementing the SnapKiosk private-delivery contract is connected.');}
    catch (error) {setMessage(error?.message || 'Could not save delivery settings.');}
    finally {setSaving(false);}
  };

  if (!config) return <SafeAreaView style={styles.safe}><Text style={styles.text}>Loading delivery settings…</Text></SafeAreaView>;
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>PRIVATE DIGITAL DELIVERY</Text>
        <Text style={styles.title}>Delivery setup</Text>
        <Text style={styles.description}>The app needs a backend to create short-lived upload and download authorization. Do not enter cloud storage secrets here; credentials must stay on the server.</Text>
        <View style={styles.status}><Text style={styles.label}>DELIVERY STATUS</Text><Text style={styles.value}>{config.delivery.enabled ? 'Waiting for backend integration' : 'Disabled'}</Text><Text style={styles.note}>No QR code will be shown until the backend confirms the private photo is available to download.</Text></View>
        <Text style={styles.label}>Backend base URL</Text>
        <TextInput value={config.delivery.apiBaseUrl} onChangeText={apiBaseUrl => update({apiBaseUrl})} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://your-domain.example/api" placeholderTextColor="#A7A094" style={styles.input} accessibilityLabel="Delivery backend URL" />
        <Text style={styles.label}>Link retention (days)</Text>
        <TextInput value={String(config.delivery.retentionDays)} onChangeText={value => update({retentionDays: Number(value.replace(/\D/g, '').slice(0, 3))})} keyboardType="number-pad" maxLength={3} style={styles.input} />
        <View style={styles.toggle}><Text style={styles.label}>Enable delivery after backend is connected</Text><Switch value={config.delivery.enabled} onValueChange={enabled => update({enabled})} /></View>
        {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
        <PrimaryButton title={saving ? 'Saving…' : 'Save delivery setup'} onPress={save} loading={saving} style={styles.button} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({safe: {flex: 1, backgroundColor: '#F6F0E6'}, content: {width: '100%', maxWidth: 860, alignSelf: 'center', padding: 28, paddingBottom: 48, gap: 14}, kicker: {fontSize: 11, letterSpacing: 2, color: '#77736A', fontWeight: '700'}, title: {fontFamily: 'Georgia', fontSize: 38, color: '#26241F'}, description: {fontSize: 16, lineHeight: 24, color: '#77736A', marginBottom: 8}, status: {backgroundColor: '#FFFCF7', borderColor: '#E8E0D4', borderWidth: 1, borderRadius: 18, padding: 18, gap: 6, marginBottom: 8}, label: {fontSize: 14, fontWeight: '700', color: '#26241F'}, value: {fontSize: 20, fontWeight: '700', color: '#9D4235'}, note: {fontSize: 14, lineHeight: 21, color: '#77736A'}, input: {minHeight: 56, borderRadius: 12, borderWidth: 1, borderColor: '#E8E0D4', backgroundColor: '#FFFCF7', paddingHorizontal: 16, fontSize: 16, color: '#26241F'}, toggle: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 58, gap: 14}, message: {fontSize: 14, lineHeight: 20, color: '#4C5F57'}, button: {alignSelf: 'flex-start', minWidth: 220}, text: {padding: 28, color: '#77736A'}});
