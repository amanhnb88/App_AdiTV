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
  useWindowDimensions // Tambahan hook dari React Native
} from 'react-native';
import Video from 'react-native-video';

const M3U_URL = 'https://raw.githubusercontent.com/amanhnb88/AdiTV/main/streams/playlist_super.m3u';

export default function App() {
  // Gunakan hook ini agar isTV otomatis update saat HP diputar (portrait/landscape)
  const { width, height } = useWindowDimensions();
  const isTV = width > height; 

  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [activeChannel, setActiveChannel] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);

  const [showControls, setShowControls] = useState(true);
  const [showZapping, setShowZapping] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  const hideControlsTimer = useRef(null);
  const zappingAnim = useRef(new Animated.Value(150)).current;

  // 1. Parser M3U yang Diperbaiki (Aman untuk Multiple URL)
  const parseM3U = (data) => {
    const lines = data.split('\n');
    const parsedChannels = [];
    let currentChannel = null;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      
      // Abaikan baris kosong atau komentar (opsional, tapi lebih aman)
      if (!line || line.startsWith('//')) continue;

      if (line.startsWith('#EXTINF')) {
        // Jika sebelumnya ada channel yang sudah punya URL, simpan dulu!
        if (currentChannel && currentChannel.url) {
          parsedChannels.push({ ...currentChannel });
        }
        
        // Mulai objek channel baru
        currentChannel = { id: Math.random().toString(36).substr(2, 9), urls: [] };
        
        const logoMatch = line.match(/tvg-logo="(.*?)"/);
        const groupMatch = line.match(/group-title="(.*?)"/);
        const nameMatch = line.split(',').pop();

        currentChannel.logo = logoMatch ? logoMatch[1] : '';
        currentChannel.group = groupMatch ? groupMatch[1] : 'Lainnya';
        currentChannel.name = nameMatch ? nameMatch.trim() : 'Tanpa Nama';
        
      } else if (currentChannel) {
        // Membaca Metadata DRM & Jaringan
        if (line.startsWith('#KODIPROP:inputstream.adaptive.license_type=')) {
          currentChannel.licenseType = line.split('=')[1];
        } else if (line.startsWith('#KODIPROP:inputstream.adaptive.license_key=')) {
          currentChannel.licenseKey = line.replace('#KODIPROP:inputstream.adaptive.license_key=', '');
        } else if (line.startsWith('#EXTVLCOPT:http-referrer=')) {
          currentChannel.referrer = line.replace('#EXTVLCOPT:http-referrer=', '');
        } else if (line.startsWith('#EXTVLCOPT:http-user-agent=')) {
          currentChannel.userAgent = line.replace('#EXTVLCOPT:http-user-agent=', '');
        } else if (line.startsWith('http')) {
          // Hanya menyimpan URL pertama sebagai URL utama
          if (!currentChannel.url) {
            currentChannel.url = line;
          }
          // (Opsional) Kamu bisa menyimpan fallback URL ke currentChannel.urls jika mau
          currentChannel.urls.push(line);
        }
      }
    }
    
    // Jangan lupa simpan channel paling terakhir di akhir file!
    if (currentChannel && currentChannel.url) {
      parsedChannels.push({ ...currentChannel });
    }
    
    return parsedChannels;
  };

  // 2. Ambil Data
  useEffect(() => {
    const fetchPlaylist = async () => {
      try {
        const response = await fetch(M3U_URL);
        const textData = await response.text();
        const data = parseM3U(textData);
        
        const uniqueCategories = [...new Set(data.map((ch) => ch.group))];
        setChannels(data);
        setCategories(uniqueCategories);
        if (uniqueCategories.length > 0) {
          setSelectedCategory(uniqueCategories[0]);
        }
      } catch (error) {
        console.error('Gagal memuat M3U:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPlaylist();
  }, []);

  // 3. Handle Back Button
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

  // 4. Logika Player Controls
  const startHideTimer = () => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    if (showControls && !showZapping) {
      hideControlsTimer.current = setTimeout(() => {
        setShowControls(false);
      }, 4000); 
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
    Animated.timing(zappingAnim, {
      toValue,
      duration: 300,
      useNativeDriver: true,
    }).start();
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

  if (isPlaying && activeChannel) {
    let drmConfig = undefined;
    
    // Konfigurasi DRM yang lebih aman
    if (activeChannel.licenseType && activeChannel.licenseKey) {
      drmConfig = {
        type: activeChannel.licenseType === 'com.widevine.alpha' ? 'widevine' : 'clearkey',
        licenseServer: activeChannel.licenseKey
      };
    }

    const currentCategoryChannels = channels.filter(c => c.group === activeChannel.group);

    return (
      <View style={styles.playerContainer}>
        <StatusBar hidden={true} />
        
        <TouchableWithoutFeedback onPress={handleTouchVideo}>
          <View style={styles.videoWrapper}>
            <Video
              source={{
                uri: activeChannel.url,
                headers: {
                  'User-Agent': activeChannel.userAgent || 'ExoPlayer',
                  'Referer': activeChannel.referrer || '',
                }
              }}
              drm={drmConfig} // DRM Inject
              style={styles.fullScreenVideo}
              resizeMode="contain"
              paused={isPaused}
              onError={(e) => console.log("Video Error:", e)}
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
                {drmConfig && (
                  <Text style={styles.playerDrm}>🔑 {drmConfig.type.toUpperCase()}</Text>
                )}
              </View>
            </View>

            <View style={styles.centerControls} pointerEvents="box-none">
               <TouchableOpacity 
                 style={styles.playPauseBtn} 
                 onPress={() => { setIsPaused(!isPaused); startHideTimer(); }}
               >
                 <Text style={{ fontSize: 30, color: '#fff' }}>{isPaused ? '▶' : '⏸'}</Text>
               </TouchableOpacity>
            </View>

            <View style={styles.playerFooter}>
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={styles.progressFill} />
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
        <ActivityIndicator size="large" color="#00E676" />
        <Text style={styles.loadingText}>Memuat AdiTV...</Text>
      </View>
    );
  }

  const filteredChannels = channels.filter(ch => ch.group === selectedCategory);

  return (
    <View style={[styles.container, { flexDirection: isTV ? 'row' : 'column' }]}>
      <StatusBar hidden={isTV} backgroundColor="#0F172A" barStyle="light-content" />
      
      {isTV ? (
        <View style={styles.sidebar}>
          <Text style={styles.appTitleTV}>AdiTV</Text>
          <FlatList
            data={categories}
            keyExtractor={(item, index) => index.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                onFocus={() => setSelectedCategory(item)}
                onPress={() => setSelectedCategory(item)}
                style={[styles.categoryItemTV, selectedCategory === item && styles.categoryItemActiveTV]}
              >
                <Text style={[styles.categoryTextTV, selectedCategory === item && { color: '#fff' }]}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : (
        <View style={styles.mobileHeader}>
          <Text style={styles.appTitleMobile}>AdiTV</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mobileCategoryScroll}>
            {categories.map((cat, index) => (
              <TouchableOpacity 
                key={index} 
                style={[styles.categoryPill, selectedCategory === cat && styles.categoryPillActive]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[styles.categoryPillText, selectedCategory === cat && { color: '#000' }]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.mainContent}>
        {isTV && <Text style={styles.categoryTitle}>{selectedCategory}</Text>}
        
        <FlatList
          data={filteredChannels}
          keyExtractor={(item) => item.id}
          key={isTV ? 'TV_GRID' : 'MOBILE_GRID'} 
          numColumns={isTV ? 4 : 2}
          columnWrapperStyle={styles.rowWrapper}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => playChannel(item)}
              style={isTV ? styles.channelItemTV : styles.channelItemMobile}
            >
              <View style={styles.logoBox}>
                <Text style={styles.logoText}>{item.logo ? item.name.charAt(0) : '📺'}</Text>
              </View>
              <Text style={styles.channelName} numberOfLines={2}>{item.name}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </View>
  );
}

// ... [Pertahankan StyleSheet persis seperti milikmu sebelumnya] ...
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  loadingContainer: { flex: 1, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#fff', marginTop: 15, fontSize: 18 },
  sidebar: { width: '25%', backgroundColor: '#1E293B', padding: 15 },
  appTitleTV: { color: '#00E676', fontSize: 32, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  categoryItemTV: { padding: 15, borderRadius: 8, marginBottom: 5 },
  categoryItemActiveTV: { backgroundColor: '#334155' },
  categoryTextTV: { color: '#94A3B8', fontSize: 18, fontWeight: '600' },
  channelItemTV: { flex: 1, margin: 10, padding: 15, backgroundColor: '#1E293B', borderRadius: 12, alignItems: 'center', aspectRatio: 1 },
  categoryTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginBottom: 15, marginLeft: 10 },
  mobileHeader: { paddingTop: Platform.OS === 'ios' ? 40 : 10, paddingBottom: 10, backgroundColor: '#1E293B' },
  appTitleMobile: { color: '#00E676', fontSize: 24, fontWeight: 'bold', paddingHorizontal: 20, marginBottom: 10 },
  mobileCategoryScroll: { paddingHorizontal: 15, paddingBottom: 5 },
  categoryPill: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#0F172A', borderRadius: 20, marginRight: 10 },
  categoryPillActive: { backgroundColor: '#00E676' },
  categoryPillText: { color: '#94A3B8', fontWeight: 'bold', fontSize: 14 },
  channelItemMobile: { flex: 1, margin: 8, padding: 15, backgroundColor: '#1E293B', borderRadius: 16, alignItems: 'center' },
  mainContent: { flex: 1, padding: 10 },
  rowWrapper: { justifyContent: 'flex-start' },
  logoBox: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  logoText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  channelName: { color: '#fff', fontSize: 14, textAlign: 'center', fontWeight: '500' },
  playerContainer: { flex: 1, backgroundColor: '#000' },
  videoWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  fullScreenVideo: { position: 'absolute', top: 0, left: 0, bottom: 0, right: 0 },
  controlsOverlay: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', justifyContent: 'space-between' },
  playerHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.6)' },
  iconBtn: { width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  iconText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  playerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  playerDrm: { color: '#00E676', fontSize: 12, marginTop: 2 },
  centerControls: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  playPauseBtn: { width: 70, height: 70, backgroundColor: 'rgba(0, 230, 118, 0.7)', borderRadius: 35, justifyContent: 'center', alignItems: 'center' },
  playerFooter: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.6)' },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e11d48', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginRight: 15 },
  liveDot: { width: 6, height: 6, backgroundColor: '#fff', borderRadius: 3, marginRight: 5 },
  liveText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  progressBar: { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, marginRight: 15 },
  progressFill: { width: '100%', height: '100%', backgroundColor: '#e11d48', borderRadius: 2 },
  zappingBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  zappingText: { color: '#fff', fontSize: 14 },
  zappingSlider: { position: 'absolute', bottom: 0, left: 0, width: '100%', height: 120, backgroundColor: 'rgba(15, 23, 42, 0.95)', paddingVertical: 20, paddingHorizontal: 10 },
  miniChannel: { width: 100, height: 80, backgroundColor: '#1E293B', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 10, borderWidth: 2, borderColor: 'transparent' },
  miniChannelActive: { borderColor: '#00E676', backgroundColor: '#334155' },
  miniChannelLogo: { fontSize: 24, color: '#94A3B8', marginBottom: 5 },
  miniChannelName: { color: '#fff', fontSize: 12, textAlign: 'center', paddingHorizontal: 5 }
});
