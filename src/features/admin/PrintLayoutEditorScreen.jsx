import React, {useCallback, useRef, useState} from 'react';
import {PanResponder, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import PrimaryButton from '../../components/PrimaryButton';
import {loadPrintLayout, savePrintLayout} from '../../services/printLayout';
import {listTemplates} from '../../services/templateRepository';
import {loadBrand} from '../../services/brandSettings';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const expandTokens = (value, brand) => value.replace(/\{(businessName|eventName|thankYouMessage|date)\}/gi, (_, token) => ({
  businessname: brand.businessName || 'BUSINESS NAME',
  eventname: brand.eventName || 'EVENT NAME',
  thankyoumessage: brand.thankYouMessage || 'THANK YOU FOR VISITING',
  date: new Date().toLocaleDateString(),
})[token.toLowerCase()] || '');

export default function PrintLayoutEditorScreen({navigation}) {
  const {width: screenWidth} = useWindowDimensions();
  const [layout, setLayout] = useState({frame: false, elements: []});
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [brand, setBrand] = useState({businessName: 'SnapKiosk', eventName: ''});
  const [selectedId, setSelectedId] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const layoutRef = useRef(layout);

  const updateLayout = updater => setLayout(current => {
    const next = typeof updater === 'function' ? updater(current) : updater;
    layoutRef.current = next;
    return next;
  });

  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.all([loadPrintLayout(), listTemplates(), loadBrand()]).then(([savedLayout, savedTemplates, savedBrand]) => {
      if (!active) return;
      layoutRef.current = savedLayout;
      setLayout(savedLayout);
      setTemplates(savedTemplates.filter(item => item.enabled));
      const preferred = savedTemplates.find(item => item.presetId === 'strip4' && item.enabled) || savedTemplates.find(item => item.enabled);
      setTemplateId(current => current && savedTemplates.some(item => item.id === current && item.enabled) ? current : preferred?.id || '');
      setBrand(savedBrand);
    }).catch(loadError => setError(loadError?.message || 'Could not load print layout settings.'));
    return () => {active = false;};
  }, []));

  const activeTemplate = templates.find(item => item.id === templateId) || templates[0];
  const aspect = activeTemplate ? activeTemplate.canvas.width / activeTemplate.canvas.height : 0.5;
  const maxCanvasWidth = Math.min(screenWidth - 64, 360);
  const canvasHeight = Math.min(460, maxCanvasWidth / Math.max(0.25, aspect));
  const canvasWidth = canvasHeight * aspect;
  const selected = layout.elements.find(item => item.id === selectedId);

  const dragHandlers = element => {
    let originX = element.x;
    let originY = element.y;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) + Math.abs(gesture.dy) > 3,
      onPanResponderGrant: () => {
        const current = layoutRef.current.elements.find(item => item.id === element.id);
        originX = current?.x ?? element.x;
        originY = current?.y ?? element.y;
        setSelectedId(element.id);
      },
      onPanResponderMove: (_, gesture) => {
        updateLayout(current => ({...current, elements: current.elements.map(item => item.id === element.id ? {
          ...item,
          x: clamp(originX + gesture.dx / Math.max(1, canvasWidth), 0, 1 - item.width),
          y: clamp(originY + gesture.dy / Math.max(1, canvasHeight), 0, 0.94),
        } : item)}));
      },
    });
  };

  const addText = text => {
    if (layout.elements.length >= 12) {setError('A print layout can contain up to 12 text blocks.'); return;}
    const element = {id: `text-${Date.now().toString(36)}`, text, x: 0.1, y: 0.42 + (layout.elements.length % 3) * 0.07, width: 0.8, size: 2, align: 'center', enabled: true};
    updateLayout(current => ({...current, elements: [...current.elements, element]}));
    setSelectedId(element.id);
    setError('');
  };

  const applyBoardingPass = () => {
    const now = Date.now().toString(36);
    updateLayout(current => ({
      ...current,
      frame: true,
      photoTop: 0.22,
      photoBottom: 0.17,
      elements: [
        {id: `design-${now}-brand`, text: '{businessName}', x: 0.1, y: 0.025, width: 0.8, size: 1, align: 'center', enabled: true},
        {id: `design-${now}-title`, text: 'BOARDING PASS', x: 0.05, y: 0.065, width: 0.9, size: 3, align: 'center', enabled: true},
        {id: `design-${now}-event`, text: 'EVENT: {eventName}\nDATE: {date}', x: 0.08, y: 0.13, width: 0.84, size: 1, align: 'left', enabled: true},
        {id: `design-${now}-seat`, text: 'GATE: PHOTO BOOTH   SEAT: 01', x: 0.05, y: 0.86, width: 0.9, size: 1, align: 'center', enabled: true},
        {id: `design-${now}-thanks`, text: '{thankYouMessage}', x: 0.05, y: 0.92, width: 0.9, size: 1, align: 'center', enabled: true},
      ],
    }));
    setSelectedId('');
    setError('');
    setMessage('Boarding pass design applied. Review and save it to use for prints.');
  };

  const updateSelected = patch => updateLayout(current => ({...current, elements: current.elements.map(item => item.id === selectedId ? {...item, ...patch} : item)}));
  const save = async () => {
    setSaving(true); setMessage(''); setError('');
    try {const saved = await savePrintLayout(layout); layoutRef.current = saved; setLayout(saved); setMessage('Print layout saved. New compositions will use this design.');}
    catch (saveError) {setError(saveError?.message || 'Could not save the print layout.');}
    finally {setSaving(false);}
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text onPress={() => navigation.goBack()} style={styles.back}>‹  Admin settings</Text>
        <Text style={styles.kicker}>PRINT DESIGN</Text>
        <Text style={styles.title}>Print layout editor</Text>
        <Text style={styles.description}>Add text, drag it on the page, and adjust its size and alignment. Text supports {`{businessName}`}, {`{eventName}`}, {`{date}`} and {`{thankYouMessage}`} placeholders.</Text>
        {templates.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateChoices}>{templates.map(template => <Text key={template.id} onPress={() => setTemplateId(template.id)} style={[styles.templateChoice, template.id === activeTemplate?.id && styles.templateChoiceActive]}>{template.name}</Text>)}</ScrollView> : null}
        {activeTemplate ? <Text style={styles.caption}>Previewing: {activeTemplate.name}. Text will overlay the selected photo layout.</Text> : <Text style={styles.caption}>Enable a photo layout before customizing its print design.</Text>}

        {activeTemplate ? <View style={[styles.canvas, {width: canvasWidth, height: canvasHeight}]}>
          {activeTemplate.photoSlots.map((slot, index) => {
            const photoScale = 1 - (layout.photoTop || 0) - (layout.photoBottom || 0);
            return <View key={`${activeTemplate.id}-${index}`} style={[styles.photoSlot, {left: slot.x * canvasWidth, top: ((layout.photoTop || 0) + slot.y * photoScale) * canvasHeight, width: slot.width * canvasWidth, height: slot.height * photoScale * canvasHeight}]} />;
          })}
          {layout.frame ? <View pointerEvents="none" style={styles.frame} /> : null}
          {layout.elements.filter(item => item.enabled).map(element => {
            const pan = dragHandlers(element);
            return <View key={element.id} {...pan.panHandlers} onTouchStart={() => setSelectedId(element.id)} style={[styles.textBlock, {left: element.x * canvasWidth, top: element.y * canvasHeight, width: element.width * canvasWidth, minHeight: Math.max(24, element.size * 10), borderColor: selectedId === element.id ? '#D76F56' : 'transparent'}]}>
              <Text style={{fontSize: Math.max(8, element.size * 5), color: '#26241F', fontWeight: '800', textAlign: element.align}}>{expandTokens(element.text, brand)}</Text>
            </View>;
          })}
        </View> : null}

        <View style={styles.card}>
          <Text style={styles.label}>Starter design</Text>
          <Text style={styles.caption}>Use a ticket-style layout with event details above and below your photos.</Text>
          <Text onPress={applyBoardingPass} style={styles.starterButton}>Apply boarding pass design</Text>
          <Text style={styles.label}>Add content</Text>
          <View style={styles.addRow}>
            <Text onPress={() => addText('{businessName}')} style={styles.addChip}>+ Business name</Text>
            <Text onPress={() => addText('{eventName}')} style={styles.addChip}>+ Event name</Text>
            <Text onPress={() => addText('{date}')} style={styles.addChip}>+ Date</Text>
            <Text onPress={() => addText('{thankYouMessage}')} style={styles.addChip}>+ Thank-you message</Text>
            <Text onPress={() => addText('YOUR TEXT')} style={styles.addChip}>+ Custom text</Text>
          </View>
          <View style={styles.toggleRow}><Text style={styles.label}>Outer frame</Text><Switch value={layout.frame} onValueChange={frame => updateLayout(current => ({...current, frame}))} /></View>
          <View style={styles.controlRow}>
            <Text style={styles.label}>Photo area</Text>
            <Text style={styles.caption}>Top</Text>
            <Text onPress={() => updateLayout(current => ({...current, photoTop: clamp((current.photoTop || 0) - 0.02, 0, 0.35)}))} style={styles.step}>−</Text>
            <Text style={styles.sizeValue}>{Math.round((layout.photoTop || 0) * 100)}%</Text>
            <Text onPress={() => updateLayout(current => ({...current, photoTop: clamp((current.photoTop || 0) + 0.02, 0, 0.35 - (current.photoBottom || 0))}))} style={styles.step}>+</Text>
          </View>
          <View style={styles.controlRow}>
            <Text style={styles.caption}>Bottom</Text>
            <Text onPress={() => updateLayout(current => ({...current, photoBottom: clamp((current.photoBottom || 0) - 0.02, 0, 0.35)}))} style={styles.step}>−</Text>
            <Text style={styles.sizeValue}>{Math.round((layout.photoBottom || 0) * 100)}%</Text>
            <Text onPress={() => updateLayout(current => ({...current, photoBottom: clamp((current.photoBottom || 0) + 0.02, 0, 0.35 - (current.photoTop || 0))}))} style={styles.step}>+</Text>
          </View>
          {selected ? <>
            <Text style={styles.label}>Selected text</Text>
            <TextInput value={selected.text} onChangeText={text => updateSelected({text})} style={styles.input} maxLength={160} placeholder="Enter print text" />
            <View style={styles.controlRow}>
              <Text style={styles.label}>Text size</Text>
              <Text onPress={() => updateSelected({size: clamp(selected.size - 1, 1, 6)})} style={styles.step}>−</Text>
              <Text style={styles.sizeValue}>{selected.size}</Text>
              <Text onPress={() => updateSelected({size: clamp(selected.size + 1, 1, 6)})} style={styles.step}>+</Text>
              <Text onPress={() => updateSelected({align: selected.align === 'left' ? 'center' : selected.align === 'center' ? 'right' : 'left'})} style={styles.alignControl}>Align: {selected.align}</Text>
            </View>
            <View style={styles.controlRow}>
              <Text style={styles.label}>Block width</Text>
              <Text onPress={() => updateSelected({width: clamp(selected.width - 0.05, 0.2, 1 - selected.x)})} style={styles.step}>−</Text>
              <Text style={styles.sizeValue}>{Math.round(selected.width * 100)}%</Text>
              <Text onPress={() => updateSelected({width: clamp(selected.width + 0.05, 0.2, 1 - selected.x)})} style={styles.step}>+</Text>
            </View>
            <Text onPress={() => {updateLayout(current => ({...current, elements: current.elements.filter(item => item.id !== selectedId)})); setSelectedId('');}} style={styles.delete}>Delete selected text</Text>
          </> : <Text style={styles.caption}>Select a text block on the page to edit it. Drag it to reposition.</Text>}
        </View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.success}>{message}</Text> : null}
        <PrimaryButton title={saving ? 'Saving…' : 'Save print layout'} onPress={save} loading={saving} style={styles.saveButton} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#F6F0E6'},
  content: {width: '100%', maxWidth: 900, alignSelf: 'center', padding: 24, paddingBottom: 48, gap: 14},
  back: {alignSelf: 'flex-start', paddingVertical: 8, color: '#4C5F57', fontWeight: '700', fontSize: 15},
  kicker: {fontSize: 11, letterSpacing: 2, color: '#77736A', fontWeight: '700'},
  title: {fontFamily: 'Georgia', fontSize: 36, color: '#26241F'},
  description: {fontSize: 14, lineHeight: 21, color: '#77736A'},
  caption: {fontSize: 12, color: '#77736A', lineHeight: 18},
  templateChoices: {gap: 8},
  templateChoice: {paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: '#FFFCF7', color: '#26241F', borderWidth: 1, borderColor: '#E8E0D4'},
  templateChoiceActive: {backgroundColor: '#D8E0D5', borderColor: '#82958C', fontWeight: '700'},
  canvas: {alignSelf: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D8D0C3', overflow: 'hidden'},
  photoSlot: {position: 'absolute', backgroundColor: '#F6F0E6', borderColor: '#D8D0C3', borderWidth: 1},
  frame: {position: 'absolute', left: 8, right: 8, top: 8, bottom: 8, borderWidth: 2, borderColor: '#26241F'},
  textBlock: {position: 'absolute', borderWidth: 1, borderStyle: 'dashed', padding: 2, justifyContent: 'center'},
  card: {backgroundColor: '#FFFCF7', borderColor: '#E8E0D4', borderWidth: 1, borderRadius: 16, padding: 16, gap: 12},
  label: {fontSize: 14, color: '#26241F', fontWeight: '700'},
  addRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  addChip: {paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#D8E0D5', borderRadius: 14, fontSize: 13, fontWeight: '700', color: '#26241F'},
  starterButton: {alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#26241F', borderRadius: 12, color: '#FFFCF7', fontWeight: '700'},
  toggleRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  input: {minHeight: 52, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8E0D4', borderRadius: 12, paddingHorizontal: 14, color: '#26241F', fontSize: 16},
  controlRow: {flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap'},
  step: {width: 36, height: 36, textAlign: 'center', textAlignVertical: 'center', backgroundColor: '#E8E0D4', borderRadius: 18, fontSize: 22, color: '#26241F'},
  sizeValue: {fontWeight: '800', color: '#26241F'},
  alignControl: {padding: 9, color: '#4C5F57', fontWeight: '700'},
  delete: {color: '#9D4235', fontWeight: '700', paddingVertical: 6},
  error: {color: '#9D4235'},
  success: {color: '#4C5F57'},
  saveButton: {alignSelf: 'flex-start', minWidth: 220},
});
