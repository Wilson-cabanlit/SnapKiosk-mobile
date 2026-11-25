import React from 'react';
import {NavigationContainer, DefaultTheme} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useSelector} from 'react-redux';
import WelcomeScreen from '../features/welcome/WelcomeScreen';
import BoothReadyScreen from '../features/booth/BoothReadyScreen';
import AdminGateScreen from '../features/admin/AdminGateScreen';
import AdminHomeScreen from '../features/admin/AdminHomeScreen';
import BrandSettingsScreen from '../features/admin/BrandSettingsScreen';
import TemplatesScreen from '../features/admin/TemplatesScreen';
import PrinterSettingsScreen from '../features/admin/PrinterSettingsScreen';
import DeliverySettingsScreen from '../features/admin/DeliverySettingsScreen';
import SessionHistoryScreen from '../features/admin/SessionHistoryScreen';
import WorkflowSettingsScreen from '../features/admin/WorkflowSettingsScreen';
import PrintQueueScreen from '../features/admin/PrintQueueScreen';
import PrintLayoutEditorScreen from '../features/admin/PrintLayoutEditorScreen';
import ConsentScreen from '../features/booth/ConsentScreen';
import LayoutSelectionScreen from '../features/booth/LayoutSelectionScreen';
import CaptureSetupScreen from '../features/booth/CaptureSetupScreen';
import CompositionScreen from '../features/booth/CompositionScreen';

const Stack = createNativeStackNavigator();

function AdminGuard({children, ...props}) {
  const unlocked = useSelector(state => state.settings.adminUnlocked);
  return unlocked ? children : <AdminGateScreen {...props} />;
}

export default function RootNavigator() {
  return (
    <NavigationContainer theme={{...DefaultTheme, colors: {...DefaultTheme.colors, background: '#F6F0E6'}}}>
      <Stack.Navigator screenOptions={{headerShown: false, animation: 'fade', contentStyle: {backgroundColor: '#F6F0E6'}}}>
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="BoothReady" component={BoothReadyScreen} />
        <Stack.Screen name="Consent" component={ConsentScreen} />
        <Stack.Screen name="LayoutSelection" component={LayoutSelectionScreen} />
        <Stack.Screen name="CaptureSetup" component={CaptureSetupScreen} />
        <Stack.Screen name="Composition" component={CompositionScreen} />
        <Stack.Screen name="AdminGate" component={AdminGateScreen} options={{gestureEnabled: false}} />
        <Stack.Screen name="AdminHome">
          {props => <AdminGuard><AdminHomeScreen {...props} /></AdminGuard>}
        </Stack.Screen>
        <Stack.Screen name="BrandSettings">
          {props => <AdminGuard><BrandSettingsScreen {...props} /></AdminGuard>}
        </Stack.Screen>
        <Stack.Screen name="Templates">
          {props => <AdminGuard><TemplatesScreen {...props} /></AdminGuard>}
        </Stack.Screen>
        <Stack.Screen name="PrinterSettings">
          {props => <AdminGuard><PrinterSettingsScreen {...props} /></AdminGuard>}
        </Stack.Screen>
        <Stack.Screen name="DeliverySettings">
          {props => <AdminGuard><DeliverySettingsScreen {...props} /></AdminGuard>}
        </Stack.Screen>
        <Stack.Screen name="SessionHistory">
          {props => <AdminGuard><SessionHistoryScreen {...props} /></AdminGuard>}
        </Stack.Screen>
        <Stack.Screen name="WorkflowSettings">
          {props => <AdminGuard><WorkflowSettingsScreen {...props} /></AdminGuard>}
        </Stack.Screen>
        <Stack.Screen name="PrintQueue">
          {props => <AdminGuard><PrintQueueScreen {...props} /></AdminGuard>}
        </Stack.Screen>
        <Stack.Screen name="PrintLayoutEditor">
          {props => <AdminGuard><PrintLayoutEditorScreen {...props} /></AdminGuard>}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
