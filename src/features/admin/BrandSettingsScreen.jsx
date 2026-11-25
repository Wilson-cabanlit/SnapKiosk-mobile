import React, {useState} from 'react';
import {KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useDispatch, useSelector} from 'react-redux';
import PrimaryButton from '../../components/PrimaryButton';
import {saveBrand} from '../../services/brandSettings';
import {setBrand} from '../../store/settingsSlice';

const fields = [
  {key: 'businessName', label: 'Business name', placeholder: 'SnapKiosk', required: true},
  {key: 'logoUri', label: 'Logo image URI', placeholder: 'Optional local file path or https:// image URL'},
  {key: 'eventName', label: 'Event name', placeholder: 'Optional event or venue name'},
  {key: 'welcomeMessage', label: 'Welcome headline', placeholder: 'Make a little memory.', required: true},
  {key: 'instruction', label: 'Welcome instructions', placeholder: 'Tell guests what to do next.', multiline: true},
  {key: 'thankYouMessage', label: 'Thank-you message', placeholder: 'Thanks for making a memory with us.', multiline: true},
];

export default function BrandSettingsScreen({navigation}) {
  const dispatch = useDispatch();
  const brand = useSelector(state => state.settings.brand);
  const [form, setForm] = useState({...brand});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const updateField = (key, value) => setForm(current => ({...current, [key]: value}));

  const handleSave = async () => {
    const next = {...form};
    for (const field of fields) next[field.key] = (next[field.key] || '').trim();
    if (!next.businessName || !next.welcomeMessage) {
      setError('Business name and welcome headline are required.');
      return;
    }

    setError('');
    setSaving(true);
    try {
      const saved = await saveBrand(next);
      dispatch(setBrand(saved));
      navigation.goBack();
    } catch (saveError) {
      setError(saveError?.message || 'Could not save the event profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.kicker}>CUSTOMER WELCOME SCREEN</Text>
          <Text style={styles.title}>Brand & event profile</Text>
          <Text style={styles.description}>These details appear on the kiosk welcome screen. Changes are saved on this device.</Text>

          <View style={styles.form}>
            {fields.map(field => (
              <View key={field.key} style={styles.field}>
                <Text style={styles.label}>{field.label}{field.required ? ' *' : ''}</Text>
                <TextInput
                  value={form[field.key] || ''}
                  onChangeText={value => updateField(field.key, value)}
                  placeholder={field.placeholder}
                  placeholderTextColor="#A7A094"
                  style={[styles.input, field.multiline && styles.multiline]}
                  multiline={field.multiline}
                  textAlignVertical={field.multiline ? 'top' : 'center'}
                  maxLength={field.key === 'logoUri' ? 500 : field.key === 'instruction' ? 240 : 100}
                  accessibilityLabel={field.label}
                />
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Welcome screen colors</Text>
          <Text style={styles.description}>Enter six-digit hex colors, for example #F6F0E6. Leave a field blank to use its default.</Text>
          <View style={styles.colorGrid}>
            {[
              ['cream', 'Background'], ['ink', 'Text'], ['muted', 'Secondary text'],
              ['coral', 'Main button'], ['lavender', 'Accent'], ['card', 'Card'],
            ].map(([key, label]) => (
              <View key={key} style={styles.colorField}>
                <Text style={styles.label}>{label}</Text>
                <View style={styles.colorInputRow}>
                  <View style={[styles.swatch, {backgroundColor: /^#[\da-f]{6}$/i.test(form.colors?.[key] || '') ? form.colors[key] : brand.colors[key]}]} />
                  <TextInput
                    value={form.colors?.[key] || ''}
                    onChangeText={value => setForm(current => ({...current, colors: {...current.colors, [key]: value}}))}
                    placeholder={brand.colors[key]}
                    placeholderTextColor="#A7A094"
                    autoCapitalize="characters"
                    maxLength={7}
                    style={styles.colorInput}
                    accessibilityLabel={`${label} color`}
                  />
                </View>
              </View>
            ))}
          </View>

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <PrimaryButton title="Save profile" onPress={handleSave} loading={saving} style={styles.saveButton} />
            <Text onPress={() => navigation.goBack()} style={styles.cancel}>Cancel</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#F6F0E6'},
  flex: {flex: 1},
  content: {width: '100%', maxWidth: 900, alignSelf: 'center', padding: 28, paddingBottom: 48},
  kicker: {fontSize: 11, letterSpacing: 2, color: '#77736A', fontWeight: '700'},
  title: {fontFamily: 'Georgia', fontSize: 38, color: '#26241F', marginTop: 10},
  sectionTitle: {fontSize: 20, fontWeight: '700', color: '#26241F', marginTop: 30},
  description: {fontSize: 16, lineHeight: 24, color: '#77736A', marginTop: 10, maxWidth: 620},
  form: {marginTop: 28, gap: 18},
  field: {gap: 8},
  colorGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 18},
  colorField: {flexGrow: 1, flexBasis: 220, gap: 8},
  colorInputRow: {height: 58, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, borderColor: '#E8E0D4', paddingHorizontal: 12, backgroundColor: '#FFFCF7'},
  swatch: {height: 28, width: 28, borderRadius: 14, borderWidth: 1, borderColor: '#DDD5C9'},
  colorInput: {flex: 1, fontSize: 17, color: '#26241F'},
  label: {fontSize: 14, fontWeight: '700', color: '#26241F'},
  input: {minHeight: 58, borderRadius: 14, borderWidth: 1, borderColor: '#E8E0D4', paddingHorizontal: 16, backgroundColor: '#FFFCF7', fontSize: 17, color: '#26241F'},
  multiline: {minHeight: 104, paddingTop: 14},
  error: {color: '#9D4235', fontSize: 14, marginTop: 18},
  actions: {flexDirection: 'row', alignItems: 'center', gap: 22, marginTop: 26},
  saveButton: {minWidth: 190, minHeight: 58},
  cancel: {fontSize: 16, color: '#77736A', padding: 14},
});
