import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { WebView as RNWebView, WebViewMessageEvent } from 'react-native-webview';
import { C, R } from './theme';
import { LEAFLET_CSS, LEAFLET_JS } from './leafletAssets';

// react-native-webview types it as a plain function component but it forwards a ref at runtime.
const WebView = RNWebView as unknown as React.ComponentType<any>;
type WebViewHandle = { injectJavaScript: (js: string) => void };

export interface MapMarker { lat: number; lng: number; label?: string; color?: 'green' | 'red' | 'blue' | 'orange' }
export interface MapCircle { lat: number; lng: number; radiusKm: number }

export interface MapState {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  circle?: MapCircle | null;
  /** auto-zoom to fit markers/circle */
  fit?: boolean;
}

/**
 * OpenStreetMap through Leaflet in a WebView. No Google Maps key, so the APK works
 * without any map billing set up. Tiles need internet; GPS coordinates are still saved offline.
 * (OSM's public tile server is for light use and may block some apps. For a real rollout set EXPO_PUBLIC_TILE_URL to a tile provider you have an account with.)
 */
const TILE_URL = process.env.EXPO_PUBLIC_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>${LEAFLET_CSS}
html,body,#m{height:100%;margin:0;background:#e8efe6}.lbl{font:600 12px sans-serif}
.pin{width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 4px #0008}
#err{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font:14px sans-serif;color:#555;text-align:center;padding:20px}</style>
</head><body><div id="m"></div><div id="err">Map needs internet. Your GPS location is still saved.</div>
<script>${LEAFLET_JS}</script>
<script>
var post=function(o){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(o))};
if(typeof L==='undefined'){document.getElementById('err').style.display='flex';post({type:'noleaflet'});}
else{
var map=L.map('m',{zoomControl:true}).setView([11.0,78.0],6);
L.tileLayer('${TILE_URL}',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
var layer=L.layerGroup().addTo(map);var pickable=false;
var colors={green:'#1B5E20',red:'#C62828',blue:'#1565C0',orange:'#E65100'};
map.on('click',function(e){if(pickable)post({type:'pick',lat:e.latlng.lat,lng:e.latlng.lng});});
window.setState=function(s){
 layer.clearLayers();pickable=!!s.pickable;var b=[];
 (s.markers||[]).forEach(function(m){
  var ic=L.divIcon({className:'',html:'<div class="pin" style="background:'+(colors[m.color]||colors.green)+'"></div>',iconSize:[18,18],iconAnchor:[9,9]});
  var mk=L.marker([m.lat,m.lng],{icon:ic}).addTo(layer);if(m.label)mk.bindTooltip(m.label,{permanent:true,direction:'top',className:'lbl'});
  b.push([m.lat,m.lng]);});
 if(s.circle){var c=L.circle([s.circle.lat,s.circle.lng],{radius:s.circle.radiusKm*1000,color:'#1B5E20',fillOpacity:0.1}).addTo(layer);
  if(s.fit!==false){map.fitBounds(c.getBounds(),{padding:[20,20]});return;}}
 if(s.fit!==false&&b.length>1){map.fitBounds(b,{padding:[40,40],maxZoom:17});}
 else if(b.length===1){map.setView(b[0],s.zoom||15);}
 else if(s.center){map.setView([s.center.lat,s.center.lng],s.zoom||13);}
};}
document.addEventListener('message',function(e){try{window.setState(JSON.parse(e.data));}catch(x){}});
window.addEventListener('message',function(e){try{window.setState(JSON.parse(e.data));}catch(x){}});
post({type:'ready'});
</script></body></html>`;

export function MapView({ state, height = 260, pickable, onPick }: {
  state: MapState; height?: number; pickable?: boolean; onPick?: (lat: number, lng: number) => void;
}) {
  const ref = useRef<WebViewHandle>(null);
  const ready = useRef(false);
  const payload = useMemo(() => JSON.stringify({ ...state, pickable: !!pickable }), [state, pickable]);

  const push = useCallback(() => {
    if (ready.current) ref.current?.injectJavaScript(`window.setState(${payload});true;`);
  }, [payload]);

  useEffect(() => { push(); }, [push]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m.type === 'ready') { ready.current = true; push(); }
      else if (m.type === 'pick' && onPick) onPick(m.lat, m.lng);
    } catch { /* ignore malformed */ }
  };

  return (
    <View style={{ height, borderRadius: R.lg, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html: HTML, baseUrl: 'https://localhost/' }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        nestedScrollEnabled
      />
    </View>
  );
}
