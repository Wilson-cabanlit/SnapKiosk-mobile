import React, {useEffect, useRef, useState} from 'react';
import {Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import PrimaryButton from '../../components/PrimaryButton';
import {loadDeviceConfig, saveDeviceConfig} from '../../services/deviceConfig';
import {buildAlignmentPrintBytes, buildSamplePrintBytes, connectPrinter, disconnectPrinter, getPairedPrinters, isBluetoothSupported, isBluetoothEnabled, onDiscoveryFinished, onPrinterFound, openBluetoothSettings, requestBluetoothPermissions, sendPrinterBytes, startPrinterDiscovery, stopPrinterDiscovery} from '../../services/printer/bluetooth';
import {loadBrand} from '../../services/brandSettings';
import {DEFAULT_BRAND} from '../../utils/brand';

const PRINT_STYLES = [
  {id: 'photo-detail', mode: 'floyd-steinberg', threshold: 160, brightness: 0, contrast: 1, gamma: 1, label: 'Photo detail', description: 'Balanced gray tones for portraits.'},
  {id: 'soft-portrait', mode: 'atkinson', threshold: 165, brightness: 0.02, contrast: 0.92, gamma: 1.08, label: 'Soft portrait', description: 'Gentler shadows and smoother skin tones.'},
  {id: 'light-print', mode: 'floyd-steinberg', threshold: 145, brightness: 0.04, contrast: 0.95, gamma: 1.05, label: 'Light print', description: 'Uses less ink for dark photos.'},
  {id: 'dark-print', mode: 'floyd-steinberg', threshold: 175, brightness: -0.02, contrast: 1.2, gamma: 0.95, label: 'Dark print', description: 'Deepens shadows for faded printers.'},
  {id: 'fine-detail', mode: 'floyd-steinberg', threshold: 150, brightness: 0, contrast: 1.08, gamma: 0.9, label: 'Fine detail', description: 'Keeps more texture in hair and clothing.'},
  {id: 'classic-dots', mode: 'ordered', threshold: 155, brightness: 0, contrast: 1, gamma: 1, label: 'Classic dots', description: 'Even halftone pattern across photos.'},
  {id: 'high-contrast', mode: 'threshold', threshold: 165, brightness: 0, contrast: 1.1, gamma: 1, label: 'High contrast', description: 'Crisp black and white shapes.'},
  {id: 'poster', mode: 'threshold', threshold: 185, brightness: -0.02, contrast: 1.35, gamma: 0.9, label: 'Poster', description: 'Bold graphic look with strong blacks.'},
];

export default function PrinterSettingsScreen({navigation}) {
  const [config, setConfig] = useState(null);
  const [brand, setBrand] = useState(DEFAULT_BRAND);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [bluetoothSupported, setBluetoothSupported] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState([]);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [connectingAddress, setConnectingAddress] = useState('');
  const [testPrinting, setTestPrinting] = useState(false);
  const [bluetoothMessage, setBluetoothMessage] = useState('');
  const scanTimer = useRef(null);
  const discoverySubscriptions = useRef([]);

  useEffect(() => {
    loadDeviceConfig().then(setConfig).catch(error => setMessage(error?.message || 'Could not load printer settings.'));
    loadBrand().then(setBrand).catch(() => {});
    if (Platform.OS === 'android') isBluetoothSupported().then(setBluetoothSupported).catch(() => setBluetoothSupported(false));
    return () => {
      if (scanTimer.current) clearTimeout(scanTimer.current);
      discoverySubscriptions.current.forEach(subscription => subscription.remove());
      stopPrinterDiscovery().catch(() => {});
    };
  }, []);

  const setPrinter = patch => setConfig(current => ({...current, printer: {...current.printer, ...patch}}));
  const selectedPrintStyle = config?.printer.printStyle || PRINT_STYLES.find(style => style.mode === config?.printer.ditherMode)?.id || 'photo-detail';
  const applyPrintStyle = style => setPrinter({printStyle: style.id, ditherMode: style.mode, threshold: style.threshold, brightness: style.brightness, contrast: style.contrast, gamma: style.gamma});
  const setManualTone = patch => setPrinter({...patch, printStyle: 'custom'});
  const stopScan = async () => {
    if (scanTimer.current) clearTimeout(scanTimer.current);
    scanTimer.current = null;
    setScanning(false);
    try {await stopPrinterDiscovery();} catch (stopError) {void stopError;}
    discoverySubscriptions.current.forEach(subscription => subscription.remove());
    discoverySubscriptions.current = [];
  };

  const scanForPrinters = async () => {
    setBluetoothMessage(''); setDevices([]);
    try {
      await requestBluetoothPermissions();
      if (!(await isBluetoothEnabled())) {
        setBluetoothMessage('Bluetooth is turned off. Turn it on in Android Bluetooth settings, then scan again.');
        return;
      }
      const paired = await getPairedPrinters();
      setDevices(paired || []);
      discoverySubscriptions.current = [
        onPrinterFound(found => setDevices(current => {
          const existingIndex = current.findIndex(item => item.address === found.address);
          if (existingIndex < 0) return [...current, found];
          const next = [...current]; next[existingIndex] = {...next[existingIndex], ...found}; return next;
        })),
        onDiscoveryFinished(() => stopScan()),
      ];
      setScanning(true);
      await startPrinterDiscovery();
      scanTimer.current = setTimeout(() => stopScan(), 15000);
    } catch (error) {
      setScanning(false);
      setBluetoothMessage(error?.message || 'Could not find Bluetooth printers.');
      discoverySubscriptions.current.forEach(subscription => subscription.remove());
      discoverySubscriptions.current = [];
    }
  };

  const connectToPrinter = async device => {
    setBluetoothMessage(''); setConnectingAddress(device.address);
    try {
      await requestBluetoothPermissions();
      const connected = await connectPrinter(device.address);
      const nextConfig = {...config, printer: {...config.printer, selectedPrinter: {name: connected.name || device.name, address: device.address}}};
      await saveDeviceConfig(nextConfig);
      setConfig(nextConfig);
      setConnectedDevice({name: connected.name || device.name, address: device.address});
      setBluetoothMessage('Printer connected. This printer selection is saved on the kiosk.');
    } catch (error) {
      setBluetoothMessage(error?.message || 'Could not connect. Make sure the printer is on and paired.');
    } finally {setConnectingAddress('');}
  };

  const disconnect = async () => {
    try {await disconnectPrinter(); setConnectedDevice(null); setBluetoothMessage('Printer disconnected. Its saved selection is kept.');}
    catch (error) {setBluetoothMessage(error?.message || 'Could not disconnect the printer.');}
  };

  const printSample = async (kind = 'event') => {
    if (!connectedDevice || !config) return;
    setTestPrinting(true); setBluetoothMessage('');
    try {
      const bytes = kind === 'alignment'
        ? buildAlignmentPrintBytes({printableDots: config.printer.printableDots, horizontalOffsetDots: config.printer.horizontalOffsetDots ?? 0, feedLines: config.printer.feedLines, cut: config.printer.cutAfterPrint})
        : buildSamplePrintBytes({printableDots: config.printer.printableDots, feedLines: config.printer.feedLines, cut: config.printer.cutAfterPrint, businessName: brand.businessName, eventName: brand.eventName, thankYouMessage: brand.thankYouMessage});
      await sendPrinterBytes(bytes);
      setBluetoothMessage((kind === 'alignment' ? 'Alignment pattern' : 'Boarding pass sample') + ' sent to ' + connectedDevice.name + '. Check the paper output.');
    } catch (error) {
      setBluetoothMessage(error?.message || 'Could not send the sample receipt. Check the Bluetooth connection and printer paper.');
    } finally {setTestPrinting(false);}
  };

  const openBluetooth = async () => {
    try {await openBluetoothSettings();}
    catch (error) {setBluetoothMessage(error?.message || 'Could not open Android Bluetooth settings.');}
  };
  const save = async () => {
    const printer = config.printer;
    if (printer.threshold < 0 || printer.threshold > 255 || printer.brightness < -1 || printer.brightness > 1 || printer.contrast < 0 || printer.contrast > 3 || printer.gamma <= 0 || printer.gamma > 4) {
      setMessage('Check the threshold, brightness, contrast, and gamma ranges.');
      return;
    }
    if (!Number.isInteger(printer.horizontalOffsetDots ?? 0) || Math.abs(printer.horizontalOffsetDots ?? 0) > 48) {
      setMessage('Horizontal offset must be a whole number from −48 to 48 dots.');
      return;
    }
    setSaving(true); setMessage('');
    try {await saveDeviceConfig(config); setMessage('Printer profile saved on this device.');}
    catch (error) {setMessage(error?.message || 'Could not save printer profile.');}
    finally {setSaving(false);}
  };

  if (!config) return <SafeAreaView style={styles.safe}><Text style={styles.text}>Loading printer settings…</Text></SafeAreaView>;
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>THERMAL PRINTER</Text>
        <Text style={styles.title}>Printer profile</Text>
        <Text style={styles.description}>Find and connect an Android Bluetooth Classic ESC/POS printer, then set its paper and print profile.</Text>
        <View style={styles.status}>
          <Text style={styles.label}>BLUETOOTH PRINTER</Text>
          <Text style={[styles.value, connectedDevice && styles.connectedValue]}>{connectedDevice ? 'Connected' : config.printer.selectedPrinter ? 'Saved · disconnected' : 'Not connected'}</Text>
          <Text style={styles.note}>{connectedDevice ? connectedDevice.name + ' · ' + connectedDevice.address : config.printer.selectedPrinter ? config.printer.selectedPrinter.name + ' · ' + config.printer.selectedPrinter.address : Platform.OS === 'ios' ? 'Bluetooth Classic setup is Android-only here. iOS receipt printers need a compatible MFi or vendor adapter.' : 'Turn on the printer and put it in pairing mode. Scan to select it.'}</Text>
          {Platform.OS === 'android' && bluetoothSupported ? <View style={styles.connectionActions}>
            <PrimaryButton title={scanning ? 'Scanning…' : 'Find printers'} onPress={scanForPrinters} disabled={scanning || Boolean(connectingAddress)} loading={scanning} style={styles.scanButton} />
            <PrimaryButton title="Bluetooth settings" onPress={openBluetooth} style={styles.systemButton} />
            <PrimaryButton title={testPrinting ? 'Sending sample…' : 'Print event pass sample'} onPress={() => printSample('event')} disabled={!connectedDevice || testPrinting || Boolean(connectingAddress)} loading={testPrinting} style={styles.testPrintButton} />
            <PrimaryButton title="Print alignment pattern" onPress={() => printSample('alignment')} disabled={!connectedDevice || testPrinting || Boolean(connectingAddress)} style={styles.systemButton} />
            {connectedDevice ? <Text onPress={disconnect} style={styles.disconnect}>Disconnect</Text> : null}
          </View> : Platform.OS === 'android' ? <Text style={styles.note}>Bluetooth is not available on this device.</Text> : null}
          {bluetoothMessage ? <Text accessibilityRole="alert" style={styles.bluetoothMessage}>{bluetoothMessage}</Text> : null}
        </View>
        <View style={styles.alignmentCard}>
          <Text style={styles.label}>Print alignment preview</Text>
          <Text style={styles.note}>The sample border and the photo preview use the same printable width and horizontal offset.</Text>
          <View style={styles.alignmentPaper}>
            <View style={[styles.alignmentFrame, {
              width: `${Math.min(1, config.printer.printableDots / (config.printer.paperWidthMm * 8)) * 100}%`,
              left: `${(1 - Math.min(1, config.printer.printableDots / (config.printer.paperWidthMm * 8))) * 50 + ((config.printer.horizontalOffsetDots ?? 0) / (config.printer.paperWidthMm * 8)) * 100}%`,
            }]}>
              <View style={styles.alignmentOutline} />
              <View style={styles.alignmentCenter} />
              <View style={styles.alignmentCrossbar} />
            </View>
          </View>
          <Text style={styles.alignmentCaption}>Left edge · center line · right edge</Text>
        </View>
        <View style={styles.ticketCard}>
          <Text style={styles.label}>Event pass sample preview</Text>
          <View style={styles.ticketPreview}>
            <Text style={styles.ticketKicker}>{(brand.businessName || 'SNAPKIOSK').toUpperCase()}</Text>
            <Text style={styles.ticketTitle}>BOARDING PASS</Text>
            <Text style={styles.ticketSubtitle}>EVENT PHOTO BOOTH</Text>
            <View style={styles.ticketRule} />
            <Text style={styles.ticketField}>EVENT     {(brand.eventName || 'SPECIAL EVENT').toUpperCase()}</Text>
            <Text style={styles.ticketField}>PASSENGER PHOTO GUEST</Text>
            <Text style={styles.ticketField}>DATE      {new Date().toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: '2-digit'}).toUpperCase()}</Text>
            <Text style={styles.ticketField}>GATE   SNAPKIOSK     SEAT  MEMORY 01</Text>
            <View style={styles.ticketRule} />
            <Text style={styles.ticketFooter}>HAVE A GREAT EVENT</Text>
            <Text style={styles.ticketFooter}>{(brand.thankYouMessage || 'THANK YOU FOR JOINING US').toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.note}>Use the alignment pattern to calibrate the left and right edges. Customer print requests use the same width and horizontal offset.</Text>
        {scanning || devices.length > 0 ? <View style={styles.deviceList}>
          <Text style={styles.label}>{scanning ? 'NEARBY AND PAIRED DEVICES' : 'PAIRED DEVICES'}</Text>
          {devices.length === 0 ? <Text style={styles.note}>Searching… Keep your printer on and nearby.</Text> : devices.map(device => {
            const isSelected = config.printer.selectedPrinter?.address === device.address;
            const isConnected = connectedDevice?.address === device.address;
            return <View key={device.address} style={styles.deviceRow}>
              <View style={styles.deviceCopy}><Text style={styles.deviceName}>{device.name || 'Unknown device'}{device.paired ? ' · Paired' : ''}</Text><Text style={styles.note}>{device.address}{Number.isFinite(device.rssi) ? ' · ' + device.rssi + ' dBm' : ''}</Text></View>
              <Pressable accessibilityRole="button" disabled={Boolean(connectingAddress) || isConnected} onPress={() => connectToPrinter(device)} style={[styles.connectButton, isConnected && styles.connectedButton]}>
                <Text style={styles.connectLabel}>{connectingAddress === device.address ? 'Connecting…' : isConnected ? 'Connected' : isSelected ? 'Reconnect' : 'Connect'}</Text>
              </Pressable>
            </View>;
          })}
        </View> : null}
        <Text style={styles.note}>This connects Bluetooth Classic SPP printers. Some receipt printers use BLE or vendor-specific protocols and will not appear. Rebuild the native app after this update.</Text>
        <Text style={styles.label}>Paper width</Text>
        <View style={styles.row}>{[58, 80].map(width => <Text key={width} onPress={() => setPrinter({paperWidthMm: width, printableDots: width === 58 ? 384 : 576})} style={[styles.choice, config.printer.paperWidthMm === width && styles.choiceActive]}>{width} mm</Text>)}</View>
        <Text style={styles.label}>Actual printable dots</Text>
        <TextInput value={String(config.printer.printableDots)} onChangeText={value => setPrinter({printableDots: Number(value.replace(/\D/g, '').slice(0, 4))})} keyboardType="number-pad" maxLength={4} style={styles.input} accessibilityLabel="Printable dot width" />
        <Text style={styles.hint}>Common starting values: 384 dots for many 58 mm printers and 576 for many 80 mm printers. Verify the exact model’s printable width.</Text>
        <Text style={styles.label}>Horizontal offset (dots)</Text>
        <View style={styles.offsetRow}>
          <Pressable accessibilityRole="button" onPress={() => setPrinter({horizontalOffsetDots: Math.max(-48, (config.printer.horizontalOffsetDots ?? 0) - 1)})} style={styles.offsetButton}><Text style={styles.offsetButtonText}>−</Text></Pressable>
          <TextInput value={String(config.printer.horizontalOffsetDots ?? 0)} onChangeText={value => setPrinter({horizontalOffsetDots: Math.min(48, Number(value.replace(/\D/g, '').slice(0, 2)) || 0)})} keyboardType="number-pad" maxLength={2} style={[styles.input, styles.offsetInput]} accessibilityLabel="Horizontal print offset in dots" />
          <Pressable accessibilityRole="button" onPress={() => setPrinter({horizontalOffsetDots: Math.min(48, (config.printer.horizontalOffsetDots ?? 0) + 1)})} style={styles.offsetButton}><Text style={styles.offsetButtonText}>+</Text></Pressable>
        </View>
        <Text style={styles.hint}>Positive shifts the print right; negative shifts it left. Start at 0, compare the sample pattern, then adjust by a few dots. 8 dots is about 1 mm.</Text>
        <Text style={styles.label}>Print density (1–15)</Text>
        <TextInput value={String(config.printer.density)} onChangeText={value => setPrinter({density: Number(value.replace(/\D/g, '').slice(0, 2))})} keyboardType="number-pad" maxLength={2} style={styles.input} />
        <Text style={styles.label}>Print style</Text>
        <Text style={styles.hint}>Choose how photo tones are converted for your black-and-white receipt printer.</Text>
        <View style={styles.row}>{PRINT_STYLES.map(style => <Pressable accessibilityRole="button" key={style.id} onPress={() => applyPrintStyle(style)} style={[styles.styleChoice, selectedPrintStyle === style.id && styles.choiceActive]}><Text style={[styles.choiceText, selectedPrintStyle === style.id && styles.choiceTextActive]}>{style.label}</Text><Text style={styles.styleDescription}>{style.description}</Text></Pressable>)}{selectedPrintStyle === 'custom' ? <View style={[styles.styleChoice, styles.choiceActive]}><Text style={[styles.choiceText, styles.choiceTextActive]}>Custom</Text><Text style={styles.styleDescription}>Your manual tone settings.</Text></View> : null}</View>
        <View style={styles.toggle}><View style={styles.cleanCopy}><Text style={styles.label}>Clean empty space</Text><Text style={styles.hint}>Keeps white paper areas clear and prevents stray dots near photo edges.</Text></View><Switch value={config.printer.cleanBackground !== false} onValueChange={cleanBackground => setPrinter({cleanBackground})} accessibilityLabel="Clean empty print space" /></View>
        <Text style={styles.label}>Black threshold (0–255)</Text>
        <TextInput value={String(config.printer.threshold)} onChangeText={value => setManualTone({threshold: Number(value.replace(/\D/g, '').slice(0, 3))})} keyboardType="number-pad" maxLength={3} style={styles.input} />
        <Text style={styles.label}>Brightness (−1 to 1)</Text>
        <TextInput value={String(config.printer.brightness)} onChangeText={value => setManualTone({brightness: Number(value)})} keyboardType="decimal-pad" style={styles.input} />
        <Text style={styles.label}>Contrast (0–3)</Text>
        <TextInput value={String(config.printer.contrast)} onChangeText={value => setManualTone({contrast: Number(value)})} keyboardType="decimal-pad" style={styles.input} />
        <Text style={styles.label}>Gamma (0.1–4)</Text>
        <TextInput value={String(config.printer.gamma)} onChangeText={value => setManualTone({gamma: Number(value)})} keyboardType="decimal-pad" style={styles.input} />
        <View style={styles.toggle}><Text style={styles.label}>Cut after print</Text><Switch value={config.printer.cutAfterPrint} onValueChange={cutAfterPrint => setPrinter({cutAfterPrint})} /></View>
        <View style={styles.toggle}><Text style={styles.label}>Feed 3 lines after print</Text><Switch value={config.printer.feedLines === 3} onValueChange={enabled => setPrinter({feedLines: enabled ? 3 : 0})} /></View>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <PrimaryButton title={saving ? 'Saving…' : 'Save printer profile'} onPress={save} loading={saving} style={styles.button} />
        <PrimaryButton title="View print queue" onPress={() => navigation.navigate('PrintQueue')} style={styles.queueButton} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#F6F0E6'},
  content: {width: '100%', maxWidth: 860, alignSelf: 'center', padding: 28, paddingBottom: 48, gap: 14},
  kicker: {fontSize: 11, letterSpacing: 2, color: '#77736A', fontWeight: '700'},
  title: {fontFamily: 'Georgia', fontSize: 38, color: '#26241F'},
  description: {fontSize: 16, lineHeight: 24, color: '#77736A', marginBottom: 8},
  status: {backgroundColor: '#FFFCF7', borderColor: '#E8E0D4', borderWidth: 1, borderRadius: 18, padding: 18, gap: 8, marginBottom: 8},
  alignmentCard: {backgroundColor: '#FFFCF7', borderColor: '#E8E0D4', borderWidth: 1, borderRadius: 18, padding: 18, gap: 8},
  ticketCard: {backgroundColor: '#FFFCF7', borderColor: '#E8E0D4', borderWidth: 1, borderRadius: 18, padding: 18, gap: 10},
  ticketPreview: {alignSelf: 'center', width: '100%', maxWidth: 420, backgroundColor: '#FFFFFF', borderColor: '#26241F', borderWidth: 1, borderRadius: 12, padding: 18, gap: 7},
  ticketKicker: {fontSize: 11, letterSpacing: 2, fontWeight: '700', color: '#77736A', textAlign: 'center'},
  ticketTitle: {fontSize: 24, letterSpacing: 2, fontWeight: '900', color: '#26241F', textAlign: 'center'},
  ticketSubtitle: {fontSize: 11, letterSpacing: 1, fontWeight: '700', color: '#4C5F57', textAlign: 'center'},
  ticketRule: {height: 1, backgroundColor: '#26241F', marginVertical: 4},
  ticketField: {fontSize: 13, color: '#26241F', fontWeight: '600'},
  ticketFooter: {fontSize: 11, color: '#26241F', fontWeight: '700', textAlign: 'center'},
  alignmentPaper: {height: 150, backgroundColor: '#FFFFFF', borderColor: '#D8D0C3', borderWidth: 1, overflow: 'hidden', justifyContent: 'center'},
  alignmentFrame: {position: 'absolute', top: 12, bottom: 12, borderColor: '#D8D0C3', borderWidth: 1},
  alignmentOutline: {position: 'absolute', top: '4%', bottom: '4%', left: '3.5%', right: '3.5%', borderColor: '#26241F', borderWidth: 1},
  alignmentCenter: {position: 'absolute', top: '4%', bottom: '4%', left: '50%', width: 1, backgroundColor: '#9D4235'},
  alignmentCrossbar: {position: 'absolute', top: '50%', left: '46%', width: '8%', height: 1, backgroundColor: '#9D4235'},
  alignmentCaption: {fontSize: 12, textAlign: 'center', color: '#77736A'},
  offsetRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  offsetInput: {flex: 1},
  offsetButton: {width: 52, height: 52, borderRadius: 12, backgroundColor: '#D8E0D5', alignItems: 'center', justifyContent: 'center'},
  offsetButtonText: {fontSize: 26, fontWeight: '700', color: '#26241F'},
  label: {fontSize: 14, fontWeight: '700', color: '#26241F'},
  value: {fontSize: 20, fontWeight: '700', color: '#9D4235'},
  connectedValue: {color: '#4C5F57'},
  note: {fontSize: 14, lineHeight: 21, color: '#77736A'},
  connectionActions: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 5},
  scanButton: {minHeight: 48, minWidth: 150, backgroundColor: '#E8A18C'},
  systemButton: {minHeight: 48, minWidth: 160, backgroundColor: '#D8D0C3'},
  testPrintButton: {minHeight: 48, minWidth: 190, backgroundColor: '#D8E0D5'},
  disconnect: {color: '#9D4235', fontWeight: '700', padding: 12},
  bluetoothMessage: {fontSize: 14, lineHeight: 20, color: '#4C5F57'},
  deviceList: {backgroundColor: '#FFFCF7', borderWidth: 1, borderColor: '#E8E0D4', borderRadius: 16, padding: 16, gap: 12},
  deviceRow: {flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#E8E0D4', paddingTop: 12},
  deviceCopy: {flex: 1, gap: 3},
  deviceName: {fontSize: 15, fontWeight: '700', color: '#26241F'},
  connectButton: {borderRadius: 10, backgroundColor: '#D8E0D5', paddingHorizontal: 14, paddingVertical: 11},
  connectedButton: {backgroundColor: '#E8E0D4'},
  connectLabel: {fontSize: 13, fontWeight: '800', color: '#26241F'},
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: 12},
  choice: {backgroundColor: '#FFFCF7', color: '#26241F', borderRadius: 12, padding: 16, fontSize: 17, fontWeight: '700', borderWidth: 1, borderColor: '#E8E0D4'},
  choiceActive: {backgroundColor: '#D8E0D5', borderColor: '#82958C'},
  styleChoice: {backgroundColor: '#FFFCF7', borderRadius: 12, padding: 13, width: 190, flexGrow: 1, borderWidth: 1, borderColor: '#E8E0D4'},
  choiceText: {fontSize: 15, fontWeight: '700', color: '#26241F'},
  choiceTextActive: {color: '#31463D'},
  styleDescription: {fontSize: 12, lineHeight: 18, color: '#77736A', marginTop: 4},
  input: {height: 56, borderRadius: 12, borderWidth: 1, borderColor: '#E8E0D4', backgroundColor: '#FFFCF7', paddingHorizontal: 16, fontSize: 18, color: '#26241F'},
  hint: {fontSize: 13, color: '#77736A', lineHeight: 20, marginTop: -6},
  toggle: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52},
  cleanCopy: {flex: 1, paddingRight: 12, gap: 6},
  message: {fontSize: 14, color: '#4C5F57'},
  button: {alignSelf: 'flex-start', minWidth: 230, marginTop: 6},
  queueButton: {alignSelf: 'flex-start', minWidth: 230, backgroundColor: '#D8D0C3'},
  text: {padding: 28, color: '#77736A'},
});
