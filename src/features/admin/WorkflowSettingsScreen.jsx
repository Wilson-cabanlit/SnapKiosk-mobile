import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, Switch, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import PrimaryButton from '../../components/PrimaryButton';
import {loadDeviceConfig, saveDeviceConfig} from '../../services/deviceConfig';

const fields = [
  ['countdownSeconds', 'Capture countdown (3, 5, or 10 seconds)', [3, 5, 10]],
  ['photoCount', 'Photos per session (1–8)', [1, 2, 3, 4, 5, 6, 7, 8]],
  ['gapSeconds', 'Gap between photos (seconds)', [0, 1, 2, 3, 5, 10]],
  ['maxRetakes', 'Retakes per photo (0–3)', [0, 1, 2, 3]],
  ['defaultPrintCopies', 'Default print copies (1–5)', [1, 2, 3, 4, 5]],
];

export default function WorkflowSettingsScreen() {
  const [config, setConfig] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {loadDeviceConfig().then(setConfig).catch(error => setMessage(error?.message || 'Could not load workflow settings.'));}, []);
  const update = patch => setConfig(current => ({...current, workflow: {...current.workflow, ...patch}}));
  const save = async () => {
    if (![3, 5, 10].includes(config.workflow.countdownSeconds)) {setMessage('Choose a 3, 5, or 10-second countdown.'); return;}
    if (config.workflow.photoCount < 1 || config.workflow.photoCount > 8 || config.workflow.gapSeconds < 0 || config.workflow.gapSeconds > 10 || config.workflow.maxRetakes < 0 || config.workflow.maxRetakes > 3 || config.workflow.defaultPrintCopies < 1 || config.workflow.defaultPrintCopies > 5) {setMessage('One or more workflow values are outside the allowed range.'); return;}
    setSaving(true); setMessage('');
    try {await saveDeviceConfig(config); setMessage('Workflow settings saved on this device.');}
    catch (error) {setMessage(error?.message || 'Could not save workflow settings.');}
    finally {setSaving(false);}
  };
  if (!config) return <SafeAreaView style={styles.safe}><Text style={styles.description}>Loading workflow settings…</Text></SafeAreaView>;
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>CUSTOMER SESSION</Text>
        <Text style={styles.title}>Workflow settings</Text>
        <Text style={styles.description}>Set the customer session pacing. Camera capture and print actions will read these values when the native adapters are connected.</Text>
        {fields.map(([key, label, choices]) => (
          <View key={key} style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.choices}>{choices.map(value => <Text key={value} onPress={() => update({[key]: value})} style={[styles.choice, config.workflow[key] === value && styles.active]}>{value}{key === 'countdownSeconds' || key === 'gapSeconds' ? ' sec' : ''}</Text>)}</View>
            <TextInput value={String(config.workflow[key])} onChangeText={value => update({[key]: Number(value.replace(/\D/g, '').slice(0, 2))})} keyboardType="number-pad" maxLength={2} style={styles.input} accessibilityLabel={label} />
          </View>
        ))}
        <View style={styles.toggle}><Text style={styles.label}>Require consent before every session</Text><Switch value={config.workflow.consentRequired} onValueChange={consentRequired => update({consentRequired})} /></View>
        {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
        <PrimaryButton title={saving ? 'Saving…' : 'Save workflow'} onPress={save} loading={saving} style={styles.button} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({safe: {flex: 1, backgroundColor: '#F6F0E6'}, content: {width: '100%', maxWidth: 860, alignSelf: 'center', padding: 28, paddingBottom: 48, gap: 18}, kicker: {fontSize: 11, letterSpacing: 2, color: '#77736A', fontWeight: '700'}, title: {fontFamily: 'Georgia', fontSize: 38, color: '#26241F'}, description: {fontSize: 16, lineHeight: 24, color: '#77736A'}, field: {gap: 8}, label: {fontSize: 14, fontWeight: '700', color: '#26241F'}, choices: {flexDirection: 'row', flexWrap: 'wrap', gap: 8}, choice: {fontSize: 14, color: '#26241F', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10, backgroundColor: '#FFFCF7', borderWidth: 1, borderColor: '#E8E0D4'}, active: {backgroundColor: '#D8E0D5', borderColor: '#82958C'}, input: {height: 50, borderRadius: 12, backgroundColor: '#FFFCF7', borderWidth: 1, borderColor: '#E8E0D4', paddingHorizontal: 14, fontSize: 17, color: '#26241F'}, toggle: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 14, minHeight: 54}, message: {fontSize: 14, color: '#4C5F57'}, button: {alignSelf: 'flex-start', minWidth: 190}});
