import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  BackHandler,
  StatusBar,
  Platform,
  TouchableWithoutFeedback,
  Animated,
  ScrollView,
  useWindowDimensions
} from 'react-native';
import Video from 'react-native-video';

const M3U_URL = 'https://raw.githubusercontent.com/amanhnb88/AdiTV/main/streams/playlist_super.m3u';

export default function App() {
  const { width, height } = useWindowDimensions();
  const isTV = width > height;

  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [activeChannel, setActiveChannel] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);

  // State untuk Remote TV Focus
  const [focusedChannel, setFocusedChannel] = useState(null);
  const [focusedCategory, setFocusedCategory] = useState(null);

  const [showControls, setShowControls] = useState(true);
  const [showZapping, setShowZapping] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  const hideControlsTimer = useRef(null);
  const zappingAnim = useRef(new Animated.Value(150)).current;

  // Parser M3U
  const parseM3U = (data) => {
    const lines = data.split('\n');
    const parsedChannels = [];
    let currentChannel = null;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line || line.startsWith('//')) continue;

      if (line.startsWith('#EXTINF')) {
        if (currentChannel && currentChannel.url) {
          parsedChannels.push({ ...currentChannel });
        }
        currentChannel = { id: Math.random().toString(36).substr(2, 9), urls: [] };
        
        const logoMatch = line.match(/tvg-logo="(.*?)"/);
        const groupMatch = line.match(/group-title="(.*?)"/);
        const nameMatch = line.split(',').pop();

        currentChannel.logo = logoMatch ? logoMatch[1] : '';
        currentChannel.group = groupMatch ? groupMatch[1] : 'Lainnya';
        currentChannel.name = nameMatch ? nameMatch.trim() : 'Tanpa Nama';
        
      } else if (currentChannel) {
        if (line.startsWith('#KODIPROP:inputstream.adaptive.license_type=')) {
          currentChannel.licenseType = line.split('=')[1];
        } else if (line.startsWith('#KODIPROP:inputstream.adaptive.license_key=')) {
          currentChannel.licenseKey = line.replace('#KODIPROP:inputstream.adaptive.license_key=', '');
        } else if (line.startsWith('#EXTVLCOPT:http-referrer=')) {
          currentChannel.referrer = line.replace('#EXTVLCOPT:http-referrer=', '');
        } else if (line.startsWith('#EXTVLCOPT:http-user-agent=')) {
          currentChannel.userAgent = line.replace('#EXTVLCOPT:http-user-agent=', '');
        } else if (line.startsWith('http')) {
          if (!currentChannel.url) currentChannel.url = line;
          currentChannel.urls.push(line);
        }
      }
    }
    if (currentChannel && currentChannel.url) parsedChannels.push({ ...currentChannel });
    return parsedChannels;
  };

  useEffect(() => {
    const fetchPlaylist = async () => {
      try {
        const response = await fetch(M3U_URL);
        const textData = await response.text();
        const data = parseM3U(textData);
        
        const uniqueCategories = [...new Set(data.map((ch) => ch.group))];
        setChannels(data);
        setCategories(['Semua', ...uniqueCategories]);
        setSelectedCategory('Semua');
      } catch (error) {
        console.error('Gagal memuat M3U:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPlaylist();
  }, []);

  useEffect(() => {
    const backAction = () => {
      if (isPlaying) {
        setIsPlaying(false);
        setActiveChannel(null);
        return true; 
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [isPlaying]);

  // Player Logic
  const startHideTimer = () => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    if (showControls && !showZapping) {
      hideControlsTimer.current = setTimeout(() => setShowControls(false), 4000); 
    }
  };

  const handleTouchVideo = () => {
    if (showZapping) {
      toggleZapping(); 
      return;
    }
    setShowControls(!showControls);
    if (!showControls) startHideTimer();
  };

  const toggleZapping = () => {
    const toValue = showZapping ? 150 : 0; 
    setShowZapping(!showZapping);
    if (!showZapping) {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current); 
    } else {
      startHideTimer();
    }
    Animated.timing(zappingAnim, { toValue, duration: 300, useNativeDriver: true }).start();
  };

  const playChannel = (channel) => {
    setActiveChannel(channel);
    setIsPlaying(true);
    setIsPaused(false);
    setShowControls(true);
    setShowZapping(false);
    Animated.timing(zappingAnim, { toValue: 150, duration: 0, useNativeDriver: true }).start();
    startHideTimer();
  };

  // Fungsi Pemilih Ikon Kategori
  const getCategoryIcon = (cat) => {
    const lower = cat.toLowerCase();
    if (lower === 'semua') return '🏠';
    if (lower.includes('nasional')) return '📡';
    if (lower.includes('movie')) return '🎬';
    if (lower.includes('sport')) return '⚽';
    if (lower.includes('news')) return '📰';
    if (lower.includes('kid')) return '🧸';
    if (lower.includes('music')) return '🎵';
    if (lower.includes('knowledge')) return '🌍';
    if (lower.includes('religion')) return '🕌';
    return '📺';
  };

  if (isPlaying && activeChannel) {
    let drmConfig = undefined;
    if (activeChannel.licenseType && activeChannel.licenseKey) {
      drmConfig = {
        type: activeChannel.licenseType === 'com.widevine.alpha' ? 'widevine' : 'clearkey',
        licenseServer: activeChannel.licenseKey
      };
    }

    const currentCategoryChannels = selectedCategory === 'Semua' 
      ? channels 
      : channels.filter(c => c.group === selectedCategory);

    return (
      <View style={styles.playerContainer}>
        <StatusBar hidden={true} />
        <TouchableWithoutFeedback onPress={handleTouchVideo}>
          <View style={styles.videoWrapper}>
            <Video
              source={{
                uri: activeChannel.url,
                headers: { 'User-Agent': activeChannel.userAgent || 'ExoPlayer', 'Referer': activeChannel.referrer || '' }
              }}
              drm={drmConfig}
              style={styles.fullScreenVideo}
              resizeMode="contain"
              paused={isPaused}
            />
          </View>
        </TouchableWithoutFeedback>

        {showControls && (
          <View style={styles.controlsOverlay} pointerEvents="box-none">
            <View style={styles.playerHeader}>
              <TouchableOpacity style={styles.iconBtn} onPress={() => setIsPlaying(false)}>
                <Text style={styles.iconText}>✕</Text>
              </TouchableOpacity>
              <View style={{ marginLeft: 15, flex: 1 }}>
                <Text style={styles.playerTitle}>{activeChannel.name}</Text>
                {drmConfig && <Text style={styles.playerDrm}>🔑 {drmConfig.type.toUpperCase()}</Text>}
              </View>
            </View>
            <View style={styles.centerControls} pointerEvents="box-none">
               <TouchableOpacity style={styles.playPauseBtn} onPress={() => { setIsPaused(!isPaused); startHideTimer(); }}>
                 <Text style={{ fontSize: 30, color: '#fff' }}>{isPaused ? '▶' : '⏸'}</Text>
               </TouchableOpacity>
            </View>
            <View style={styles.playerFooter}>
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
              <TouchableOpacity style={styles.zappingBtn} onPress={toggleZapping}>
                <Text style={styles.zappingText}>📑 Daftar Channel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Animated.View style={[styles.zappingSlider, { transform: [{ translateY: zappingAnim }] }]}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={currentCategoryChannels}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={[styles.miniChannel, activeChannel.id === item.id && styles.miniChannelActive]}
                onPress={() => playChannel(item)}
              >
                <Text style={styles.miniChannelLogo}>{item.logo ? item.name.charAt(0) : '📺'}</Text>
                <Text style={styles.miniChannelName} numberOfLines={1}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
        </Animated.View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar hidden={true} />
        <ActivityIndicator size="large" color="#E50914" />
        <Text style={styles.loadingText}>Memuat AdiTV...</Text>
      </View>
    );
  }

  const filteredChannels = selectedCategory === 'Semua' ? channels : channels.filter(ch => ch.group === selectedCategory);

  return (
    <View style={[styles.container, { flexDirection: isTV ? 'row' : 'column' }]}>
      <StatusBar hidden={isTV} backgroundColor="#0B0C10" barStyle="light-content" />
      
      {/* SIDEBAR GAYA MODERN */}
      {isTV ? (
        <View style={styles.sidebar}>
          <Text style={styles.appTitleTV}>Adi<Text style={{color:'#fff'}}>TV</Text></Text>
          <FlatList
            data={categories}
            keyExtractor={(item, index) => index.toString()}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                onFocus={() => { setFocusedCategory(item); setSelectedCategory(item); }}
                onBlur={() => setFocusedCategory(null)}
                onPress={() => setSelectedCategory(item)}
                style={[
                  styles.categoryItemTV, 
                  selectedCategory === item && styles.categoryItemActiveTV,
                  focusedCategory === item && styles.categoryItemFocused
                ]}
              >
                <Text style={styles.categoryIcon}>{getCategoryIcon(item)}</Text>
                <Text style={[styles.categoryTextTV, selectedCategory === item && { color: '#FFF', fontWeight: 'bold' }]}>
                  {item}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : (
        <View style={styles.mobileHeader}>
          <Text style={styles.appTitleMobile}>Adi<Text style={{color:'#fff'}}>TV</Text></Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mobileCategoryScroll}>
            {categories.map((cat, index) => (
              <TouchableOpacity 
                key={index} 
                style={[styles.categoryPill, selectedCategory === cat && styles.categoryPillActive]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={styles.categoryPillIcon}>{getCategoryIcon(cat)}</Text>
                <Text style={[styles.categoryPillText, selectedCategory === cat && { color: '#FFF' }]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* GRID CHANNEL GAYA NETFLIX/DISNEY+ */}
      <View style={styles.mainContent}>
        {isTV && <Text style={styles.headerTitle}>{selectedCategory}</Text>}
        
        <FlatList
          data={filteredChannels}
          keyExtractor={(item) => item.id}
          key={isTV ? 'TV_GRID' : 'MOBILE_GRID'} 
          numColumns={isTV ? 5 : 2}
          columnWrapperStyle={styles.rowWrapper}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => playChannel(item)}
              onFocus={() => setFocusedChannel(item.id)}
              onBlur={() => setFocusedChannel(null)}
              style={[
                isTV ? styles.channelCardTV : styles.channelCardMobile,
                focusedChannel === item.id && styles.channelCardFocused
              ]}
            >
              <View style={styles.cardImagePlaceholder}>
                <Text style={styles.cardImageText}>{item.logo ? item.name.charAt(0) : '📺'}</Text>
              </View>
              <View style={styles.cardLabel}>
                <Text style={styles.channelName} numberOfLines={1}>{item.name}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      </View>
    </View>
  );
}

// STYLESHEET TEMA DEEP DARK (MODERN TV)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0C10' }, // Warna latar belakang sangat gelap
  loadingContainer: { flex: 1, backgroundColor: '#0B0C10', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#fff', marginTop: 15, fontSize: 18, fontWeight: 'bold' },
  
  // -- UI TV --
  sidebar: { width: 220, backgroundColor: '#12141A', paddingVertical: 20, paddingHorizontal: 15, borderRightWidth: 1, borderRightColor: '#1F222A' },
  appTitleTV: { color: '#E50914', fontSize: 34, fontWeight: '900', marginBottom: 30, paddingHorizontal: 10, letterSpacing: 1 },
  categoryItemTV: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15, borderRadius: 10, marginBottom: 8 },
  categoryItemActiveTV: { backgroundColor: '#1F222A' },
  categoryItemFocused: { borderWidth: 2, borderColor: '#FFF', backgroundColor: '#2A2D35' }, // Efek saat dipilih remot
  categoryIcon: { fontSize: 20, marginRight: 15 },
  categoryTextTV: { color: '#8A8D93', fontSize: 16, fontWeight: '600' },
  
  headerTitle: { color: '#FFF', fontSize: 28, fontWeight: 'bold', marginBottom: 20, marginTop: 10, marginLeft: 10 },
  
  channelCardTV: { flex: 1, margin: 8, backgroundColor: '#181A20', borderRadius: 12, overflow: 'hidden', aspectRatio: 16/11, borderWidth: 2, borderColor: 'transparent' },
  channelCardFocused: { borderColor: '#FFF', transform: [{ scale: 1.05 }], zIndex: 10 }, // Zoom membesar saat difokus remot
  
  // -- UI Mobile --
  mobileHeader: { paddingTop: Platform.OS === 'ios' ? 40 : 15, paddingBottom: 10, backgroundColor: '#12141A' },
  appTitleMobile: { color: '#E50914', fontSize: 28, fontWeight: '900', paddingHorizontal: 20, marginBottom: 15 },
  mobileCategoryScroll: { paddingHorizontal: 15, paddingBottom: 10 },
  categoryPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#1F222A', borderRadius: 25, marginRight: 10 },
  categoryPillActive: { backgroundColor: '#E50914' },
  categoryPillIcon: { fontSize: 16, marginRight: 6 },
  categoryPillText: { color: '#8A8D93', fontWeight: 'bold', fontSize: 14 },
  channelCardMobile: { flex: 1, margin: 8, backgroundColor: '#181A20', borderRadius: 12, overflow: 'hidden', aspectRatio: 1 },

  // -- Card Content --
  mainContent: { flex: 1, padding: isTV ? 20 : 10 },
  rowWrapper: { justifyContent: 'flex-start' },
  cardImagePlaceholder: { flex: 1, backgroundColor: '#1F222A', justifyContent: 'center', alignItems: 'center' },
  cardImageText: { color: '#FFF', fontSize: 40, fontWeight: 'bold', opacity: 0.5 },
  cardLabel: { padding: 12, backgroundColor: '#181A20', borderTopWidth: 1, borderTopColor: '#2A2D35' },
  channelName: { color: '#E0E0E0', fontSize: 14, textAlign: 'center', fontWeight: 'bold' },

  // -- UI Player --
  playerContainer: { flex: 1, backgroundColor: '#000' },
  videoWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  fullScreenVideo: { position: 'absolute', top: 0, left: 0, bottom: 0, right: 0 },
  controlsOverlay: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', justifyContent: 'space-between' },
  playerHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.7)' },
  iconBtn: { width: 45, height: 45, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  iconText: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  playerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  playerDrm: { color: '#E50914', fontSize: 12, marginTop: 4, fontWeight: 'bold' },
  centerControls: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  playPauseBtn: { width: 80, height: 80, backgroundColor: 'rgba(229, 9, 20, 0.8)', borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  playerFooter: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.7)' },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E50914', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, marginRight: 15 },
  liveDot: { width: 8, height: 8, backgroundColor: '#fff', borderRadius: 4, marginRight: 6 },
  liveText: { color: '#fff', fontSize: 13, fontWeight: 'bold', letterSpacing: 1 },
  zappingBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 25 },
  zappingText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  zappingSlider: { position: 'absolute', bottom: 0, left: 0, width: '100%', height: 130, backgroundColor: 'rgba(11, 12, 16, 0.95)', paddingVertical: 20, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: '#1F222A' },
  miniChannel: { width: 110, height: 85, backgroundColor: '#181A20', borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 2, borderColor: '#1F222A' },
  miniChannelActive: { borderColor: '#E50914', backgroundColor: '#1F222A' },
  miniChannelLogo: { fontSize: 28, color: '#8A8D93', marginBottom: 5 },
  miniChannelName: { color: '#fff', fontSize: 13, textAlign: 'center', paddingHorizontal: 5, fontWeight: 'bold' }
});
