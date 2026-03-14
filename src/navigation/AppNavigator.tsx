import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { LevelSelectionScreen } from '../screens/LevelSelectionScreen';
import { FlashcardScreen } from '../screens/FlashcardScreen';
import { QuizScreen } from '../screens/QuizScreen';
import { ResultsScreen } from '../screens/ResultsScreen';
import { DifficultWordsScreen } from '../screens/DifficultWordsScreen';
import { SentenceBuilderScreen } from '../screens/SentenceBuilderScreen';
import { TabNavigator } from './TabNavigator';

export type RootStackParamList = {
  LevelSelection: undefined;
  Main: undefined;
  Flashcard: undefined;
  Quiz: undefined;
  Results: undefined;
  DifficultWords: undefined;
  Settings: undefined;
  SentenceBuilder: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const { state, isLoaded } = useApp();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' }}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  const hasLevel = !!state.level;

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={hasLevel ? 'Main' : 'LevelSelection'}
        screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      >
        <Stack.Screen name="LevelSelection" component={LevelSelectionScreen} />
        {/* Main is now the Tab Navigator */}
        <Stack.Screen name="Main" component={TabNavigator} options={{ animation: 'fade' }} />
        <Stack.Screen
          name="Flashcard"
          component={FlashcardScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="Quiz"
          component={QuizScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="Results"
          component={ResultsScreen}
          options={{ animation: 'fade' }}
        />
        <Stack.Screen
          name="DifficultWords"
          component={DifficultWordsScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="SentenceBuilder"
          component={SentenceBuilderScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
