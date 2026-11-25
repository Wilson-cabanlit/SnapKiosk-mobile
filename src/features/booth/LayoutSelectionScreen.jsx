import React, {useCallback, useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSelector} from 'react-redux';
import PrimaryButton from '../../components/PrimaryButton';
import {listTemplates} from '../../services/templateRepository';
import {createSession, transitionSession, upsertSession} from '../../services/sessionRepository';

const preferredLayout = enabled => enabled.find(template => template.presetId === 'strip4')
  || enabled.find(template => template.photoSlots.length >= 4)
  || enabled.find(template => template.photoSlots.length > 1)
  || enabled[0]
  || null;

export default function LayoutSelectionScreen({navigation, route}) {
  const brand = useSelector(state => state.settings.brand);
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const enabled = (await listTemplates()).filter(template => template.enabled);
      const preferred = preferredLayout(enabled);
      const ordered = preferred ? [preferred, ...enabled.filter(template => template.id !== preferred.id)] : enabled;
      setTemplates(ordered);
      setSelected(current => current && enabled.some(template => template.id === current.id) ? current : preferred);
    } catch (loadError) {setError(loadError?.message || 'Could not load layouts.');}
  }, []);
  useFocusEffect(useCallback(() => {refresh();}, [refresh]));

  const continueToCamera = async () => {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      let session = createSession({templateId: selected.id, eventName: brand.eventName, consentAt: route.params?.consentAt});
      session = transitionSession(session, 'layout');
      await upsertSession(session);
      navigation.navigate('CaptureSetup', {sessionId: session.id, templateName: selected.name, photoCount: selected.photoSlots.length});
    } catch (saveError) {setError(saveError?.message || 'Could not save this photo session on the kiosk.');}
    finally {setBusy(false);}
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>CHOOSE A PHOTO LAYOUT</Text>
        <Text style={styles.title}>How would you like your photos?</Text>
        <Text style={styles.description}>Choose one layout for this session. You can change your selection before capture.</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {templates.length === 0 ? <View style={styles.empty}><Text style={styles.cardTitle}>No layouts are enabled</Text><Text style={styles.description}>Ask the kiosk administrator to enable a photo layout.</Text></View> : templates.map(template => (
          <View key={template.id} onTouchEnd={() => setSelected(template)} style={[styles.card, selected?.id === template.id && styles.cardSelected]}>
            <Text onPress={() => setSelected(template)} style={styles.cardTitle}>{template.name}</Text>
            <Text style={styles.description}>{template.photoSlots.length} photo{template.photoSlots.length === 1 ? '' : 's'} · {template.canvas.width}:{template.canvas.height}</Text>
            <View style={styles.preview}>
              {template.photoSlots.map((slot, index) => <View key={`${template.id}-${index}`} style={[styles.slot, {left: `${slot.x * 100}%`, top: `${slot.y * 100}%`, width: `${slot.width * 100}%`, height: `${slot.height * 100}%`}]} />)}
            </View>
            {selected?.id === template.id ? <Text style={styles.selected}>SELECTED</Text> : null}
          </View>
        ))}
        <PrimaryButton title={busy ? 'Preparing session…' : 'Continue'} onPress={continueToCamera} disabled={!selected || busy} style={styles.button} />
        <Text onPress={() => navigation.popToTop()} style={styles.cancel}>Cancel session</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({safe: {flex: 1, backgroundColor: '#F6F0E6'}, content: {width: '100%', maxWidth: 900, alignSelf: 'center', padding: 28, paddingBottom: 42, gap: 14}, kicker: {fontSize: 11, letterSpacing: 2, color: '#77736A', fontWeight: '700'}, title: {fontFamily: 'Georgia', fontSize: 38, color: '#26241F'}, description: {fontSize: 15, lineHeight: 22, color: '#77736A'}, card: {position: 'relative', backgroundColor: '#FFFCF7', borderColor: '#E8E0D4', borderWidth: 1, borderRadius: 18, padding: 18, gap: 8}, cardSelected: {borderColor: '#82958C', borderWidth: 2}, cardTitle: {fontSize: 18, fontWeight: '700', color: '#26241F'}, preview: {height: 84, width: 120, backgroundColor: '#EEE7DB', borderRadius: 7, overflow: 'hidden', position: 'relative', marginTop: 4}, slot: {position: 'absolute', backgroundColor: '#BCCDBA', borderColor: '#FFFCF7', borderWidth: 2, borderRadius: 3}, selected: {position: 'absolute', right: 16, top: 18, color: '#4C5F57', fontSize: 11, fontWeight: '800', letterSpacing: 1}, empty: {padding: 20, backgroundColor: '#FFFCF7', borderRadius: 16, gap: 8}, button: {alignSelf: 'flex-start', minWidth: 190, marginTop: 8}, cancel: {fontSize: 15, color: '#77736A', padding: 14, alignSelf: 'flex-start'}, error: {fontSize: 14, color: '#9D4235'}});
