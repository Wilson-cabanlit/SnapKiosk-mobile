import React from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text} from 'react-native';

export default function PrimaryButton({title, onPress, disabled = false, loading = false, style}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{disabled: disabled || loading}}
      disabled={disabled || loading}
      onPress={onPress}
      style={({pressed}) => [styles.button, pressed && styles.pressed, disabled && styles.disabled, style]}>
      {loading ? <ActivityIndicator color="#26241F" /> : <Text style={styles.text}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {minHeight: 64, borderRadius: 18, backgroundColor: '#E8A18C', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30},
  pressed: {opacity: 0.82, transform: [{scale: 0.99}]},
  disabled: {opacity: 0.5},
  text: {color: '#26241F', fontSize: 19, fontWeight: '700', letterSpacing: 0.2},
});
