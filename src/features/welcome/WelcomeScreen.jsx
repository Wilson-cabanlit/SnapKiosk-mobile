import React, {useCallback, useRef, useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {useSelector} from 'react-redux';
import {useFocusEffect} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import PrimaryButton from '../../components/PrimaryButton';
import {loadDeviceConfig} from '../../services/deviceConfig';

export default function WelcomeScreen({navigation}) {
  const brand = useSelector(state => state.settings.brand);
  const {width} = useWindowDimensions();
  const [backend, setBackend] = useState(null);
  const [backendReady, setBackendReady] = useState(false);
  const holdTimer = useRef(null);
  const tablet = width >= 700;

  const startAdminHold = () => {
    holdTimer.current = setTimeout(() => navigation.navigate('AdminGate'), 5000);
  };
  const cancelAdminHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  };
  const refreshBackend = useCallback(async () => {
    try {setBackend((await loadDeviceConfig()).backend);} catch {setBackend(null);}
    finally {setBackendReady(true);}
  }, []);
  useFocusEffect(useCallback(() => {
    refreshBackend();
    const timer = setInterval(refreshBackend, 5000);
    return () => clearInterval(timer);
  }, [refreshBackend]));
  const backendUnavailable = backend && backend.mode !== 'standalone' && backend.connectionStatus !== 'connected';
  const pauseBooth = !backendReady || Boolean(backendUnavailable && !backend.continueOffline);

  return (
    <SafeAreaView style={[styles.safe, {backgroundColor: brand.colors.cream}]}>
      <View style={[styles.content, tablet && styles.tabletContent]}>
        <View style={styles.topline}>
          <Text style={styles.eyebrow}>A LITTLE MOMENT, MADE TO KEEP</Text>
          <View style={styles.topActions}>
            <Text style={styles.date}>{new Date().toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open kiosk settings"
              onPress={() => navigation.navigate('AdminGate')}
              hitSlop={8}
              style={styles.settingsButton}
            >
              <Text style={styles.settingsIcon}>⚙</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.heroRow}>
          <View style={styles.copy}>
            <Pressable onPressIn={startAdminHold} onPressOut={cancelAdminHold} accessibilityLabel="SnapKiosk logo">
              {brand.logoUri ? <Image source={{uri: brand.logoUri}} style={styles.logo} resizeMode="contain" /> : null}
              <Text style={[styles.brand, {color: brand.colors.ink}]}>{brand.businessName}</Text>
            </Pressable>
            {brand.eventName ? <Text style={[styles.event, {color: brand.colors.muted}]}>{brand.eventName}</Text> : null}
            <Text style={[styles.title, {color: brand.colors.ink}, tablet && styles.tabletTitle]}>{brand.welcomeMessage}</Text>
            <Text style={[styles.body, {color: brand.colors.muted}]}>{brand.instruction}</Text>
            <PrimaryButton title="Start photo booth" onPress={() => navigation.navigate('BoothReady')} disabled={pauseBooth} style={[styles.startButton, {backgroundColor: brand.colors.coral}]} />
            <Text style={[styles.footnote, {color: brand.colors.muted}]}>{!backendReady ? 'Loading kiosk settings…' : pauseBooth ? 'The configured backend is not confirmed as reachable. Ask the administrator to reconnect or allow offline operation.' : backend?.mode === 'standalone' ? 'Standalone mode: photos stay on this kiosk and digital delivery is off.' : 'Photos are kept on this kiosk unless a supported digital delivery feature is enabled.'}</Text>
          </View>
          <View style={styles.art} accessibilityElementsHidden>
            <View style={styles.sun} />
            <View style={styles.photoCard}>
              <View style={styles.photoScene}>
                <View style={styles.circle} />
                <View style={styles.hillOne} />
                <View style={styles.hillTwo} />
              </View>
              <View style={styles.cardLabel} />
              <View style={styles.cardLabelShort} />
            </View>
            <View style={styles.sparkle}>✦</View>
          </View>
        </View>
        <View style={styles.bottom}>
          <Text style={styles.bottomText}>Take a breath. We’ll guide you through.</Text>
          <View style={styles.dots}><View style={styles.dot} /><View style={[styles.dot, styles.dotMuted]} /><View style={[styles.dot, styles.dotMuted]} /></View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#F6F0E6'},
  content: {flex: 1, paddingHorizontal: 28, paddingVertical: 18, justifyContent: 'space-between'},
  tabletContent: {paddingHorizontal: '8%', paddingVertical: 32},
  topline: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  topActions: {flexDirection: 'row', alignItems: 'center', gap: 12},
  eyebrow: {fontSize: 11, letterSpacing: 2.3, fontWeight: '700', color: '#77736A'},
  date: {fontSize: 13, color: '#77736A'},
  settingsButton: {width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFCF7', borderWidth: 1, borderColor: '#E8E0D4'},
  settingsIcon: {fontSize: 21, color: '#4C5F57'},
  heroRow: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  copy: {flex: 1, maxWidth: 620, paddingVertical: 28, zIndex: 1},
  brand: {fontSize: 19, fontWeight: '800', letterSpacing: 0.5},
  logo: {height: 52, width: 170, marginBottom: 12},
  event: {marginTop: 8, color: '#77736A', fontSize: 15},
  title: {fontFamily: 'Georgia', fontSize: 46, lineHeight: 52, color: '#26241F', marginTop: 28, maxWidth: 510},
  tabletTitle: {fontSize: 64, lineHeight: 70},
  body: {fontSize: 18, lineHeight: 28, color: '#77736A', marginTop: 20, maxWidth: 440},
  startButton: {marginTop: 34, alignSelf: 'flex-start', minWidth: 250},
  footnote: {color: '#77736A', fontSize: 12, marginTop: 16},
  art: {width: '42%', maxWidth: 430, height: '70%', minHeight: 300, alignItems: 'center', justifyContent: 'center'},
  sun: {position: 'absolute', width: 265, height: 265, borderRadius: 140, backgroundColor: '#E9D7B4', top: '8%', right: '5%'},
  photoCard: {width: '68%', height: '83%', minHeight: 260, backgroundColor: '#FFFCF7', borderRadius: 8, padding: 13, transform: [{rotate: '5deg'}], shadowColor: '#403529', shadowOpacity: 0.15, shadowRadius: 22, shadowOffset: {width: 0, height: 12}, elevation: 5},
  photoScene: {flex: 1, overflow: 'hidden', backgroundColor: '#C5D7D2', alignItems: 'center'},
  circle: {width: 76, height: 76, borderRadius: 40, backgroundColor: '#F3D59B', marginTop: '17%'},
  hillOne: {position: 'absolute', width: '140%', height: '53%', bottom: '-14%', left: '-10%', borderRadius: 120, backgroundColor: '#8FA99C', transform: [{rotate: '-12deg'}]},
  hillTwo: {position: 'absolute', width: '145%', height: '39%', bottom: '-16%', right: '-37%', borderRadius: 120, backgroundColor: '#D48D79', transform: [{rotate: '12deg'}]},
  cardLabel: {height: 8, width: '52%', borderRadius: 4, backgroundColor: '#DDD5C9', marginTop: 13, alignSelf: 'center'},
  cardLabelShort: {height: 6, width: '32%', borderRadius: 4, backgroundColor: '#EBE5DC', marginTop: 6, alignSelf: 'center'},
  sparkle: {position: 'absolute', color: '#D48D79', fontSize: 48, top: '11%', left: '3%'},
  bottom: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  bottomText: {color: '#77736A', fontSize: 13},
  dots: {flexDirection: 'row', gap: 7},
  dot: {width: 8, height: 8, borderRadius: 4, backgroundColor: '#26241F'},
  dotMuted: {backgroundColor: '#D8D0C3'},
});
