import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import PrimaryButton from '../../components/PrimaryButton';

export default function BoothReadyScreen({navigation}) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.wrap}>
        <Text style={styles.kicker}>YOUR PHOTO SESSION</Text>
        <Text style={styles.title}>Let’s get your photos ready.</Text>
        <Text style={styles.body}>First, review the photo privacy notice. Then choose one of the layouts enabled for this event.</Text>
        <PrimaryButton title="Continue" onPress={() => navigation.navigate('Consent')} style={styles.button} />
        <Text style={styles.cancel} onPress={() => navigation.popToTop()}>Cancel and return to welcome</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({safe: {flex: 1, backgroundColor: '#F6F0E6'}, wrap: {flex: 1, justifyContent: 'center', padding: 32, maxWidth: 760, alignSelf: 'center'}, kicker: {fontSize: 12, letterSpacing: 2, color: '#77736A', fontWeight: '700'}, title: {fontFamily: 'Georgia', fontSize: 40, color: '#26241F', marginTop: 20}, body: {fontSize: 18, lineHeight: 28, color: '#77736A', marginTop: 16}, button: {marginTop: 30, alignSelf: 'flex-start'}, cancel: {color: '#77736A', marginTop: 22, padding: 12, alignSelf: 'flex-start'}});
