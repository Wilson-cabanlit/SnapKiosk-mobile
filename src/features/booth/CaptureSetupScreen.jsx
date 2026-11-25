import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Image, Linking, ScrollView, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Camera, useCameraDevice, useCameraPermission, usePhotoOutput} from 'react-native-vision-camera';
import PrimaryButton from '../../components/PrimaryButton';
import {loadDeviceConfig} from '../../services/deviceConfig';
import {listSessions, transitionSession, upsertSession} from '../../services/sessionRepository';

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const photoUri = path => path.startsWith('file://') ? path : `file://${path}`;

export default function CaptureSetupScreen({navigation, route}) {
  const isFocused = useIsFocused();
  const {width} = useWindowDimensions();
  const {hasPermission, canRequestPermission, requestPermission} = useCameraPermission();
  const [position, setPosition] = useState('front');
  const device = useCameraDevice(position);
  const otherDevice = useCameraDevice(position === 'front' ? 'back' : 'front');
  const photoOutput = usePhotoOutput({containerFormat: 'jpeg', quality: 0.92, qualityPrioritization: 'quality'});
  const totalPhotos = Math.max(1, Number(route.params?.photoCount) || 1);
  const [photos, setPhotos] = useState([]);
  const [countdownSeconds, setCountdownSeconds] = useState(3);
  const [countdown, setCountdown] = useState(null);
  const [retakeOrdinal, setRetakeOrdinal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [message, setMessage] = useState('');
  const [started, setStarted] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([loadDeviceConfig(), listSessions()]).then(([config, sessions]) => {
      if (!active) return;
      setCountdownSeconds(config.workflow?.countdownSeconds || 3);
      const session = sessions.find(item => item.id === route.params?.sessionId);
      if (session) {
        setPhotos(session.photos || []);
        setStarted(session.status === 'capture' || (session.photos || []).length > 0);
        setStorageWarning((session.photos || []).length > 0);
      }
    }).catch(error => setMessage(error?.message || 'Could not restore this photo session.'));
    return () => {active = false;};
  }, [route.params?.sessionId]);

  const cameraActive = isFocused && hasPermission && Boolean(device) && (photos.length < totalPhotos || retakeOrdinal !== null);
  const nextOrdinal = useMemo(() => retakeOrdinal ?? Math.min(photos.length, totalPhotos - 1), [photos.length, retakeOrdinal, totalPhotos]);
  const remaining = totalPhotos - photos.length;

  const requestCamera = useCallback(async () => {
    setMessage('');
    if (!canRequestPermission) {
      setMessage('Camera permission is disabled. Open device settings and allow SnapKiosk to use the camera.');
      return;
    }
    try {
      if (await requestPermission()) setMessage('');
      else setMessage('Camera permission was not granted. Allow it to take your session photos.');
    } catch (error) {setMessage(error?.message || 'Could not request camera permission.');}
  }, [canRequestPermission, requestPermission]);

  const capturePhoto = useCallback(async () => {
    if (!device || !hasPermission || busy || remaining <= 0 && retakeOrdinal === null) return;
    setBusy(true); setMessage(''); setCameraError('');
    const ordinal = nextOrdinal;
    try {
      for (let seconds = countdownSeconds; seconds > 0; seconds -= 1) {
        setCountdown(seconds);
        await wait(1000);
      }
      setCountdown(null);
      const captured = await photoOutput.capturePhotoToFile({flashMode: 'off'}, {});
      const photo = {id: `${route.params?.sessionId}-photo-${ordinal + 1}-${Date.now()}`, ordinal, filePath: captured.filePath, capturedAt: new Date().toISOString(), cameraPosition: position};
      const sessions = await listSessions();
      const session = sessions.find(item => item.id === route.params?.sessionId);
      if (!session) throw new Error('This session was not found in local storage. Please return to welcome and start again.');
      const nextSession = {
        ...session,
        status: 'capture',
        photos: [...session.photos.filter(item => item.ordinal !== ordinal), photo].sort((a, b) => a.ordinal - b.ordinal),
      };
      await upsertSession(nextSession);
      setPhotos(nextSession.photos);
      setStarted(true);
      setRetakeOrdinal(null);
      setStorageWarning(true);
    } catch (error) {
      setCameraError(error?.message || 'The camera could not take a photo. Try again or check the camera permission.');
    } finally {
      setCountdown(null);
      setBusy(false);
    }
  }, [busy, countdownSeconds, device, hasPermission, nextOrdinal, photoOutput, position, remaining, retakeOrdinal, route.params?.sessionId]);

  const endSession = async () => {
    setBusy(true); setMessage('');
    try {
      const session = (await listSessions()).find(item => item.id === route.params?.sessionId);
      if (session) await upsertSession(transitionSession(session, 'cancelled'));
      navigation.popToTop();
    } catch (error) {setMessage(error?.message || 'Could not end the session.');}
    finally {setBusy(false);}
  };

  const finishCapture = () => navigation.navigate('Composition', {sessionId: route.params?.sessionId});

  const cameraPanelHeight = width >= 850 ? '76%' : '67%';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.preview}>
          {hasPermission && device ? (
            <Camera
              style={StyleSheet.absoluteFill}
              device={device}
              outputs={[photoOutput]}
              isActive={cameraActive}
              mirrorMode="auto"
              onError={error => setCameraError(error?.message || 'The camera stopped unexpectedly.')}
              onStarted={() => setCameraError('')}
            />
          ) : (
            <View style={styles.cameraEmpty}>
              <Text style={styles.cameraIcon}>◎</Text>
              <Text style={styles.cameraEmptyTitle}>{hasPermission ? 'No camera found' : 'Allow camera access'}</Text>
              <Text style={styles.cameraEmptyBody}>{hasPermission ? 'This device did not report a front camera. Switch to the rear camera or use a compatible device.' : 'SnapKiosk needs camera permission to take your photos.'}</Text>
              {!hasPermission && canRequestPermission ? <PrimaryButton title="Allow camera" onPress={requestCamera} style={styles.permissionButton} /> : null}
              {!hasPermission && !canRequestPermission ? <Text onPress={() => Linking.openSettings()} style={styles.settingsLink}>Open device settings</Text> : null}
            </View>
          )}
          <View pointerEvents="none" style={styles.topOverlay}>
            <View><Text style={styles.kickerLight}>PHOTO {Math.min(photos.length + (retakeOrdinal === null ? 1 : 0), totalPhotos)} OF {totalPhotos}</Text><Text style={styles.layoutName}>{route.params?.templateName || 'Photo session'}</Text></View>
            <Text style={styles.sessionBadge}>{photos.length}/{totalPhotos} READY</Text>
          </View>
          {countdown !== null ? <View style={styles.countdownOverlay} pointerEvents="none"><Text style={styles.countdown}>{countdown}</Text><Text style={styles.countdownLabel}>GET READY</Text></View> : null}
        </View>

        <View style={[styles.controls, {maxHeight: cameraPanelHeight}]}>
          <View style={styles.controlHeader}>
            <View><Text style={styles.controlTitle}>{photos.length === totalPhotos ? 'Review your photos' : started ? 'Nice! Keep going.' : 'Ready when you are.'}</Text><Text style={styles.controlSub}>{photos.length === totalPhotos ? 'You can retake any shot before finishing.' : `${remaining} photo${remaining === 1 ? '' : 's'} remaining · ${countdownSeconds}-second countdown`}</Text></View>
            {otherDevice ? <Text onPress={() => setPosition(position === 'front' ? 'back' : 'front')} style={styles.switchCamera}>⇄  Flip</Text> : null}
          </View>

          {photos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>
              {photos.map(photo => (
                <View key={photo.id} style={styles.photoTile}>
                  <Image source={{uri: photoUri(photo.filePath)}} style={styles.photoThumb} />
                  <Text style={styles.photoNumber}>PHOTO {photo.ordinal + 1}</Text>
                  <Text onPress={() => {setRetakeOrdinal(photo.ordinal); setMessage('Retake selected photo.');}} style={styles.retake}>Retake</Text>
                </View>
              ))}
            </ScrollView>
          ) : null}

          {storageWarning ? <Text style={styles.storageWarning}>Photos are in temporary app storage for this test build. Keep SnapKiosk open until you finish; durable photo-file storage is still to be added.</Text> : null}
          {cameraError ? <Text accessibilityRole="alert" style={styles.error}>{cameraError}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}

          {photos.length < totalPhotos || retakeOrdinal !== null ? (
            <PrimaryButton title={busy ? countdown === null ? 'Saving photo…' : 'Get ready…' : retakeOrdinal !== null ? `Retake photo ${retakeOrdinal + 1}` : photos.length === 0 ? 'Take first photo' : 'Take next photo'} onPress={capturePhoto} loading={busy} disabled={!hasPermission || !device} style={styles.captureButton} />
          ) : (
            <PrimaryButton title="Finish capture" onPress={finishCapture} style={styles.captureButton} />
          )}
          <Text onPress={endSession} style={styles.endSession}>{busy ? 'Working…' : 'End session and return to welcome'}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#141514'},
  container: {flex: 1, width: '100%', maxWidth: 1500, alignSelf: 'center', padding: 14, gap: 14},
  preview: {flex: 1, minHeight: 250, borderRadius: 22, overflow: 'hidden', backgroundColor: '#222522'},
  cameraEmpty: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28},
  cameraIcon: {fontSize: 56, color: '#BCCDBA'},
  cameraEmptyTitle: {fontSize: 22, color: '#FFFCF7', fontWeight: '700', textAlign: 'center', marginTop: 12},
  cameraEmptyBody: {fontSize: 15, lineHeight: 22, color: '#D3D1CA', textAlign: 'center', marginTop: 8, maxWidth: 440},
  permissionButton: {marginTop: 20, minHeight: 52, backgroundColor: '#E8A18C'},
  settingsLink: {fontSize: 15, color: '#E8A18C', marginTop: 18, padding: 12},
  topOverlay: {position: 'absolute', top: 18, left: 18, right: 18, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between'},
  kickerLight: {fontSize: 11, fontWeight: '800', letterSpacing: 1.7, color: '#F6F0E6'},
  layoutName: {fontSize: 16, color: '#FFFCF7', fontWeight: '700', marginTop: 5},
  sessionBadge: {fontSize: 11, color: '#26241F', fontWeight: '800', backgroundColor: '#E8A18C', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20},
  countdownOverlay: {position: 'absolute', alignSelf: 'center', top: '25%', alignItems: 'center'},
  countdown: {fontSize: 104, lineHeight: 116, color: '#FFFCF7', fontWeight: '800', textShadowColor: '#00000088', textShadowRadius: 12},
  countdownLabel: {fontSize: 13, letterSpacing: 2.5, color: '#FFFCF7', fontWeight: '800'},
  controls: {backgroundColor: '#F6F0E6', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 16, gap: 10},
  controlHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
  controlTitle: {fontSize: 20, fontWeight: '800', color: '#26241F'},
  controlSub: {fontSize: 13, color: '#77736A', marginTop: 3},
  switchCamera: {paddingHorizontal: 13, paddingVertical: 10, borderRadius: 14, backgroundColor: '#E8E0D4', color: '#26241F', fontSize: 14, fontWeight: '700'},
  photoStrip: {gap: 10, paddingVertical: 2},
  photoTile: {width: 112, backgroundColor: '#FFFCF7', borderRadius: 12, padding: 6, alignItems: 'center'},
  photoThumb: {width: 100, height: 68, backgroundColor: '#E8E0D4', borderRadius: 8},
  photoNumber: {fontSize: 10, fontWeight: '800', letterSpacing: 1, color: '#77736A', marginTop: 5},
  retake: {fontSize: 12, color: '#9D4235', fontWeight: '700', paddingVertical: 4},
  storageWarning: {fontSize: 11, color: '#8C5D36', lineHeight: 15},
  error: {fontSize: 13, color: '#9D4235', lineHeight: 18},
  message: {fontSize: 13, color: '#4C5F57', lineHeight: 18},
  captureButton: {minHeight: 56, backgroundColor: '#E8A18C'},
  endSession: {fontSize: 13, color: '#77736A', textAlign: 'center', padding: 5},
});
