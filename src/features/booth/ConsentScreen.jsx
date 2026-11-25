import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSelector} from 'react-redux';
import PrimaryButton from '../../components/PrimaryButton';

export default function ConsentScreen({navigation}) {
  const brand = useSelector(state => state.settings.brand);
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.kicker}>BEFORE WE BEGIN</Text>
        <Text style={styles.title}>Your photos, your choice.</Text>
        <Text style={styles.body}>{brand.businessName} will use the kiosk camera to take the photos you choose during this session.</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Photo privacy</Text>
          <Text style={styles.cardBody}>Photos are intended to stay on this kiosk unless digital delivery is configured and you choose it. You can stop before capture. This demo flow does not access the camera or take a photo.</Text>
        </View>
        <Text style={styles.note}>By continuing, you confirm that everyone in your group agrees to be photographed.</Text>
        <PrimaryButton title="I agree — choose a layout" onPress={() => navigation.navigate('LayoutSelection', {consentAt: new Date().toISOString()})} style={styles.button} />
        <Text onPress={() => navigation.popToTop()} style={styles.cancel}>I don’t agree — cancel</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({safe: {flex: 1, backgroundColor: '#F6F0E6'}, wrap: {width: '100%', maxWidth: 820, alignSelf: 'center', justifyContent: 'center', flexGrow: 1, padding: 32}, kicker: {fontSize: 12, letterSpacing: 2, color: '#77736A', fontWeight: '700'}, title: {fontFamily: 'Georgia', fontSize: 42, color: '#26241F', marginTop: 18}, body: {fontSize: 18, lineHeight: 28, color: '#77736A', marginTop: 16}, card: {backgroundColor: '#FFFCF7', borderColor: '#E8E0D4', borderWidth: 1, borderRadius: 18, padding: 22, marginTop: 26}, cardTitle: {fontSize: 18, fontWeight: '700', color: '#26241F'}, cardBody: {fontSize: 15, lineHeight: 24, color: '#77736A', marginTop: 10}, note: {fontSize: 14, lineHeight: 21, color: '#77736A', marginTop: 20}, button: {marginTop: 24, alignSelf: 'flex-start'}, cancel: {fontSize: 15, color: '#77736A', padding: 14, alignSelf: 'flex-start', marginTop: 4}});
