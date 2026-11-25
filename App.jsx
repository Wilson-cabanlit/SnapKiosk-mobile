import 'react-native-gesture-handler';
import React, {useEffect, useState} from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import {Provider} from 'react-redux';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {store} from './src/store';
import RootNavigator from './src/app/RootNavigator';
import {loadBrand} from './src/services/brandSettings';
import {setBrand} from './src/store/settingsSlice';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadBrand()
      .then(brand => store.dispatch(setBrand(brand)))
      .catch(() => {})
      .finally(() => {if (mounted) setReady(true);});
    return () => {mounted = false;};
  }, []);

  return (
    <Provider store={store}>
      <SafeAreaProvider>
        {ready ? <RootNavigator /> : <View style={styles.loading}><ActivityIndicator color="#26241F" /></View>}
      </SafeAreaProvider>
    </Provider>
  );
}

const styles = StyleSheet.create({loading: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F0E6'}});
