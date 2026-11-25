import React, {useState} from 'react';
import {KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useDispatch} from 'react-redux';
import PrimaryButton from '../../components/PrimaryButton';
import {getLockoutMs, hasAdminPin, registerFailedAttempt, resetFailedAttempts, setAdminPin, verifyAdminPin} from '../../services/adminAuth';
import {unlockAdmin} from '../../store/settingsSlice';
import {isValidPin} from '../../utils/pin';

export default function AdminGateScreen({navigation}) {
  const dispatch = useDispatch();
  const [configured, setConfigured] = useState(null);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  React.useEffect(() => {hasAdminPin().then(setConfigured).catch(() => setMessage('Secure storage is unavailable on this device.'));}, []);

  const submit = async () => {
    setMessage('');
    if (!isValidPin(pin)) return setMessage('Enter a six-digit PIN.');
    setBusy(true);
    try {
      const lockoutMs = await getLockoutMs();
      if (lockoutMs > 0) return setMessage(`Too many attempts. Try again in ${Math.ceil(lockoutMs / 1000)} seconds.`);
      if (configured === false) {
        if (pin !== confirm) return setMessage('The PINs do not match.');
        await setAdminPin(pin);
      } else if (!(await verifyAdminPin(pin))) {
        const newLockoutMs = await registerFailedAttempt();
        if (newLockoutMs > 0) return setMessage('Too many attempts. Administrator access is paused for one minute.');
        return setMessage('That PIN is not correct. Try again.');
      }
      await resetFailedAttempts();
      dispatch(unlockAdmin());
      navigation.replace('AdminHome');
    } catch (error) {
      setMessage(error?.message || 'Could not access secure PIN storage.');
    } finally {
      setBusy(false);
    }
  };

  if (configured === null) return <SafeAreaView style={styles.safe}><Text style={styles.body}>Checking secure administrator settings…</Text></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.panel}>
          <Text style={styles.kicker}>ADMINISTRATOR ACCESS</Text>
          <Text style={styles.title}>{configured ? 'Welcome back.' : 'Set your admin PIN.'}</Text>
          <Text style={styles.body}>{configured ? 'Enter your six-digit PIN to manage SnapKiosk.' : 'This PIN is stored in the device secure keychain. Choose a PIN only administrators know.'}</Text>
          <TextInput value={pin} onChangeText={setPin} style={styles.input} keyboardType="number-pad" secureTextEntry maxLength={6} placeholder="••••••" placeholderTextColor="#A7A094" accessibilityLabel="Administrator PIN" />
          {!configured && <TextInput value={confirm} onChangeText={setConfirm} style={styles.input} keyboardType="number-pad" secureTextEntry maxLength={6} placeholder="Confirm PIN" placeholderTextColor="#A7A094" accessibilityLabel="Confirm administrator PIN" />}
          {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
          <PrimaryButton title={configured ? 'Unlock dashboard' : 'Save PIN and continue'} onPress={submit} loading={busy} />
          <Text style={styles.back} onPress={() => navigation.goBack()}>Cancel</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({safe: {flex: 1, backgroundColor: '#F6F0E6', justifyContent: 'center'}, keyboard: {flex: 1, justifyContent: 'center'}, panel: {width: '90%', maxWidth: 560, alignSelf: 'center', backgroundColor: '#FFFCF7', padding: 30, borderRadius: 24, gap: 16}, kicker: {color: '#77736A', letterSpacing: 2, fontWeight: '700', fontSize: 12}, title: {fontFamily: 'Georgia', color: '#26241F', fontSize: 38}, body: {color: '#77736A', fontSize: 16, lineHeight: 24}, input: {height: 58, borderRadius: 14, borderWidth: 1, borderColor: '#E8E0D4', paddingHorizontal: 18, fontSize: 20, color: '#26241F', letterSpacing: 5}, error: {color: '#9D4235', fontSize: 14}, back: {textAlign: 'center', color: '#77736A', padding: 12}});
