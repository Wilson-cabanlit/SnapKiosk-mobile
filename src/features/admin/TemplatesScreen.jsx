import React, {useCallback, useEffect, useState} from 'react';
import {Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import PrimaryButton from '../../components/PrimaryButton';
import {createTemplate, listTemplates, PRESETS, saveTemplates} from '../../services/templateRepository';

export default function TemplatesScreen() {
  const [templates, setTemplates] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {setTemplates(await listTemplates()); setError('');}
    catch (loadError) {setError(loadError?.message || 'Could not load photo layouts.');}
  }, []);

  useFocusEffect(useCallback(() => {refresh();}, [refresh]));

  const commit = async next => {
    setBusy(true);
    setError('');
    try {await saveTemplates(next); setTemplates(next);}
    catch (saveError) {setError(saveError?.message || 'Could not save layouts.');}
    finally {setBusy(false);}
  };

  const addTemplate = presetId => {
    const preset = PRESETS[presetId];
    const count = templates.filter(template => template.presetId === presetId).length + 1;
    const next = createTemplate(presetId, count === 1 ? preset.label : `${preset.label} ${count}`);
    commit([...templates, next]);
  };

  const updateTemplate = (id, patch) => commit(templates.map(template => template.id === id ? {...template, ...patch, updatedAt: new Date().toISOString()} : template));

  const duplicateTemplate = template => {
    const copy = {...template, id: `tpl-${Date.now().toString(36)}`, name: `${template.name} copy`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()};
    commit([...templates, copy]);
  };

  const deleteTemplate = template => Alert.alert('Delete layout?', `“${template.name}” will be removed from this kiosk.`, [
    {text: 'Cancel', style: 'cancel'},
    {text: 'Delete', style: 'destructive', onPress: () => commit(templates.filter(item => item.id !== template.id))},
  ]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>PHOTO LAYOUTS</Text>
        <Text style={styles.title}>Templates</Text>
        <Text style={styles.description}>These are local layouts and drafts stored on this kiosk. Centrally published Web templates sync separately and remain read-only here. Each photo fills one slot; the same layout is used in preview and on the receipt.</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {templates.map(template => (
          <View key={template.id} style={styles.card}>
            <View style={styles.row}>
              <TextInput value={template.name} onChangeText={name => setTemplates(current => current.map(item => item.id === template.id ? {...item, name} : item))} onEndEditing={() => updateTemplate(template.id, {name: template.name.trim()})} style={styles.name} maxLength={48} accessibilityLabel="Template name" />
              <Switch value={template.enabled} onValueChange={enabled => updateTemplate(template.id, {enabled})} accessibilityLabel={`Enable ${template.name}`} />
            </View>
            <Text style={styles.meta}>LOCAL {template.status === 'draft' ? 'DRAFT' : 'TEMPLATE'} · {PRESETS[template.presetId]?.label || 'Custom layout'} · {template.photoSlots.length} photo{template.photoSlots.length === 1 ? '' : 's'} · {template.canvas.width}:{template.canvas.height}</Text>
            <View style={styles.previewRow}>
              {template.photoSlots.map((slot, index) => <View key={`${template.id}-slot-${index}`} style={[styles.slot, {left: `${slot.x * 100}%`, top: `${slot.y * 100}%`, width: `${slot.width * 100}%`, height: `${slot.height * 100}%`}]} />)}
            </View>
            <View style={styles.cardActions}>
              <Text onPress={() => duplicateTemplate(template)} style={styles.action}>Duplicate</Text>
              <Text onPress={() => deleteTemplate(template)} style={[styles.action, styles.delete]}>Delete</Text>
            </View>
          </View>
        ))}
        <Text style={styles.sectionTitle}>Add print layout</Text>
        <View style={styles.addOptions}>
          {Object.entries(PRESETS).map(([presetId, preset]) => (
            <PrimaryButton key={presetId} title={`+ ${preset.label}`} onPress={() => addTemplate(presetId)} disabled={busy} style={styles.addOption} />
          ))}
        </View>
        <Text style={styles.note}>Layouts: single photo, two-photo strip, four-photo strip, and four-photo grid. New sessions use the enabled four-photo strip by default when available.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#F6F0E6'},
  content: {width: '100%', maxWidth: 1000, alignSelf: 'center', padding: 28, paddingBottom: 48, gap: 16},
  kicker: {fontSize: 11, letterSpacing: 2, color: '#77736A', fontWeight: '700'},
  title: {fontFamily: 'Georgia', fontSize: 38, color: '#26241F'},
  description: {fontSize: 16, lineHeight: 24, color: '#77736A', maxWidth: 720},
  card: {backgroundColor: '#FFFCF7', borderColor: '#E8E0D4', borderWidth: 1, borderRadius: 18, padding: 18, gap: 10},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12},
  name: {flex: 1, fontSize: 19, fontWeight: '700', color: '#26241F', minHeight: 48},
  meta: {fontSize: 14, color: '#77736A'},
  sectionTitle: {fontSize: 20, fontWeight: '700', color: '#26241F', marginTop: 8},
  addOptions: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  addOption: {minHeight: 50, minWidth: 200, paddingHorizontal: 18, flexGrow: 1},
  previewRow: {height: 76, width: 116, backgroundColor: '#EEE7DB', borderRadius: 8, overflow: 'hidden', position: 'relative', marginTop: 4},
  slot: {position: 'absolute', backgroundColor: '#BCCDBA', borderColor: '#FFFCF7', borderWidth: 2, borderRadius: 3},
  cardActions: {flexDirection: 'row', gap: 20, marginTop: 2},
  action: {fontSize: 14, fontWeight: '700', color: '#4C5F57', paddingVertical: 8},
  delete: {color: '#9D4235'},
  add: {alignSelf: 'flex-start', minHeight: 56},
  note: {fontSize: 13, lineHeight: 20, color: '#77736A', maxWidth: 760},
  error: {color: '#9D4235'},
});
