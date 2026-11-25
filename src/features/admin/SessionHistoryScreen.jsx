import React, {useCallback, useState} from 'react';
import {Alert, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {listSessions, removeSession} from '../../services/sessionRepository';

export default function SessionHistoryScreen() {
  const [sessions, setSessions] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {setSessions(await listSessions()); setError('');}
    catch (loadError) {setError(loadError?.message || 'Could not read local session history.');}
  }, []);
  useFocusEffect(useCallback(() => {refresh();}, [refresh]));

  const filtered = sessions.filter(session => `${session.id} ${session.eventName} ${session.status} ${session.templateId}`.toLowerCase().includes(query.trim().toLowerCase()));
  const deleteSession = session => Alert.alert('Delete session record?', `This removes the local record ${session.id}.`, [
    {text: 'Cancel', style: 'cancel'},
    {text: 'Delete', style: 'destructive', onPress: async () => {await removeSession(session.id); refresh();}},
  ]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>LOCAL SESSION RECORDS</Text>
        <Text style={styles.title}>Session history</Text>
        <Text style={styles.description}>Session records are stored on this kiosk. Original photo file cleanup will be enabled with the native file-storage adapter.</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search by session, event, or status" placeholderTextColor="#A7A094" style={styles.search} accessibilityLabel="Search session history" />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {filtered.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>{query ? 'No matching sessions' : 'No sessions yet'}</Text><Text style={styles.description}>Completed or interrupted photo sessions will appear here.</Text></View> : filtered.map(session => (
          <View key={session.id} style={styles.card}>
            <View style={styles.cardTop}><Text style={styles.id}>{session.id}</Text><Text style={styles.status}>{session.status.toUpperCase()}</Text></View>
            <Text style={styles.meta}>{new Date(session.createdAt).toLocaleString()}</Text>
            <Text style={styles.meta}>{session.eventName || 'No event'} · {session.templateId || 'No layout'} · {session.photos.length} photos</Text>
            <View style={styles.cardBottom}><Text style={styles.meta}>Print jobs: {session.printJobs.length} · Delivery: {session.uploadStatus}</Text><Text onPress={() => deleteSession(session)} style={styles.delete}>Delete record</Text></View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({safe: {flex: 1, backgroundColor: '#F6F0E6'}, content: {width: '100%', maxWidth: 1000, alignSelf: 'center', padding: 28, paddingBottom: 48, gap: 14}, kicker: {fontSize: 11, letterSpacing: 2, color: '#77736A', fontWeight: '700'}, title: {fontFamily: 'Georgia', fontSize: 38, color: '#26241F'}, description: {fontSize: 15, lineHeight: 23, color: '#77736A'}, search: {height: 56, backgroundColor: '#FFFCF7', borderColor: '#E8E0D4', borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, fontSize: 16, color: '#26241F', marginTop: 4}, empty: {padding: 20, backgroundColor: '#FFFCF7', borderRadius: 16, gap: 8, marginTop: 4}, emptyTitle: {fontSize: 20, fontWeight: '700', color: '#26241F'}, card: {backgroundColor: '#FFFCF7', borderRadius: 16, borderWidth: 1, borderColor: '#E8E0D4', padding: 18, gap: 8}, cardTop: {flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'center'}, id: {fontSize: 15, fontWeight: '700', color: '#26241F', flex: 1}, status: {fontSize: 11, fontWeight: '700', color: '#4C5F57', letterSpacing: 1}, meta: {fontSize: 13, color: '#77736A'}, cardBottom: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4}, delete: {fontSize: 13, fontWeight: '700', color: '#9D4235', padding: 8}, error: {color: '#9D4235'}});
