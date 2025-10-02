// App.js (React Native)
import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { StatusBar } from 'expo-status-bar'
import HomeScreen from './src/screens/HomeScreen'
import ProfileScreen from './src/screens/ProfileScreen'

const Stack = createStackNavigator()

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator screenOptions={{
        headerStyle: { backgroundColor: '#1a1a1a' },
        headerTintColor: '#D4AF37',
      }}>
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'People Link-Social' }} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}

// HomeScreen.jsx
import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, SafeAreaView } from 'react-native'
import { Ionicons, MaterialIcons, FontAwesome } from '@expo/vector-icons'

const HomeScreen = ({ navigation }) => {
  const [refreshing, setRefreshing] = useState(false)
  const [posts, setPosts] = useState([...]) // Posts data

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>People Link</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="search" size={24} color="#D4AF37" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* Posts feed */}
        {posts.map(post => (
          <View key={post.id} style={styles.postCard}>
            <Text style={styles.userName}>{post.user.name}</Text>
            <Text style={styles.postContent}>{post.content}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="home" size={24} color="#D4AF37" />
          <Text style={styles.navText}>Home</Text>
        </TouchableOpacity>
        {/* More nav items */}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  logo: { fontSize: 24, fontWeight: 'bold', color: '#D4AF37' },
  // ... more styles
})