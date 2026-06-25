mapboxgl.accessToken = 'pk.eyJ1IjoiZHBtYXRzYWxsYSIsImEiOiJjbHgweHR5em4wNXZqMmtwdGxmZWo1MDNpIn0.OLwbosWzhp_cYGwQX4-vwg';

const map = new mapboxgl.Map({
	container: 'map',
	style: 'mapbox://styles/mapbox/streets-v11',
	preserveDrawingBuffer: false,
	fadeDuration: 0,
	center: [153, -27.5],
	zoom: 12
});

const styleSwitcher = new mapboxgl.NavigationControl();
map.addControl(styleSwitcher, 'top-left');

let userMarker = null;
let follow = false;
let lastPosition = null;

const layers = {
	streets: 'mapbox://styles/mapbox/streets-v11',
	satellite: 'mapbox://styles/mapbox/satellite-v9',
	navigation: 'mapbox://styles/mapbox/navigation-day-v1',
	light: 'mapbox://styles/mapbox/light-v10',
	dark: 'mapbox://styles/mapbox/dark-v10',
	white: {
		"version": 8,
		"sources": {},
		"layers": [
			{
				"id": "background",
				"type": "background",
				"paint": {
					"background-color": "#FFFFFF"
				}
			}
		]
	},
	black: {
		"version": 8,
		"sources": {},
		"layers": [
			{
				"id": "background",
				"type": "background",
				"paint": {
					"background-color": "#000000"
				}
			}
		]
	}
};

//prevent map from erasing when losing focus
function refreshMap() {
//	if (map && map.loaded()) {
//		map.resize();
//		map.triggerRepaint();
//	}
	if (!map) return;

	map.resize();

	const center = map.getCenter();
	const zoom = map.getZoom();

	map.jumpTo({ center, zoom });

	// extra nudge for safety
	map.setZoom(zoom + 0.01);
	map.setZoom(zoom);

	map.triggerRepaint();
}

document.addEventListener("visibilitychange", () => {
	if (!document.hidden) {
		setTimeout(refreshMap, 200);
	}
});
window.addEventListener("focus", () => {
	setTimeout(refreshMap, 200);
});
window.addEventListener("orientationchange", () => {
	setTimeout(refreshMap, 300);
});

// Handle tile layer change
document.querySelectorAll('input[name="tileLayer"]').forEach(radio => {
	radio.addEventListener('change', (e) => {
		map.setStyle(layers[e.target.value]);

		// Listen for the 'style.load' event
		map.once('style.load', () => {
			map.addSource('mapbox-dem', {
				'type': 'raster-dem',
				'url': 'mapbox://mapbox.terrain-rgb',
				'tileSize': 512,
				'maxzoom': 14
			});
			map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1 });
			// Replot activities after the new style is fully loaded
			drawActivities(activityData);
			updatePolyline();
		});
	});
});

// Center the page on the user
let lastlat, lastlng, lastalt;
if (navigator.geolocation) {
	navigator.geolocation.getCurrentPosition(
		function (position) {
			lastlat = position.coords.latitude;
			lastlng = position.coords.longitude;
			lastalt = position.coords.altitude;
			map.setCenter([lastlng, lastlat]);
		},
		function (error) {
			alert("Unable to retrieve your location. " + error.message);
		}
	);
} else {
	alert("Geolocation is not available in this browser.");
}

// Disable double-click zoom
map.doubleClickZoom.disable();
map.on('dragstart', () => {
	window.closeLayerMenu?.();
});

// Accuracy circle
function updateAccuracyCircle(center, radius) {
	if (map.getSource('accuracyCircle')) {
		map.getSource('accuracyCircle').setData({
			'type': 'Feature',
			'geometry': {
				'type': 'Point',
				'coordinates': center
			}
		});
		map.setPaintProperty('accuracyCircle', 'circle-radius', {
			'base': 2,
			'stops': [
				[0, 0], // Radius in pixels at zoom 0
				[20, metersToPixels(radius, -27.5)] // Radius at zoom 20, in Brisbane
			]
		});
	} else {
		map.addSource('accuracyCircle', {
			'type': 'geojson',
			'data': {
				'type': 'Feature',
				'geometry': {
					'type': 'Point',
					'coordinates': center
				}
			}
		});
		map.addLayer({
			'id': 'accuracyCircle',
			'type': 'circle',
			'source': 'accuracyCircle',
			'paint': {
				'circle-radius': {
					'base': 2,
					'stops': [
						[0, 0], // Radius in pixels at zoom 0
						[20, metersToPixels(radius, -27.5)] // Radius in pixels at zoom 20, in Brisbane
					],
				},
				'circle-color': 'cadetblue',
				'circle-opacity': 0.2
			}
		});
	}
}

// Function to convert meters to pixels at max zoom (zoom level 20)
function metersToPixels(meters, latitude) {
	return meters / 0.075 / Math.cos(latitude * Math.PI / 180);
}

// Compass arrow
function updateCompassArrow(center, direction) {
	const zoomLevel = map.getZoom();
	const length = 50 / 111320  / Math.pow(2,zoomLevel-16);
	const end = [
		center[0] + length * Math.sin(direction * Math.PI / 180),
		center[1] + length * Math.cos(direction * Math.PI / 180)
	];
	if (map.getSource('compassArrow')) {
		map.getSource('compassArrow').setData({
			'type': 'Feature',
			'geometry': {
				'type': 'LineString',
				'coordinates': [center, end]
			}
		});
	} else {
		map.addSource('compassArrow', {
			'type': 'geojson',
			'data': {
				'type': 'Feature',
				'geometry': {
					'type': 'LineString',
					'coordinates': [center, end]
				}
			}
		});
		map.addLayer({
			'id': 'compassArrow',
			'type': 'line',
			'source': 'compassArrow',
			'layout': {
				'line-join': 'round',
				'line-cap': 'round'
			},
			'paint': {
				'line-color': 'orange',
				'line-width': 25,
				'line-opacity': 0.3
			}
		});
	}
}

function haversineDist(coords1, coords2) {
	const R = 6371000; // Radius of the Earth in meters
	const toRadians = degrees => degrees * Math.PI / 180;
	const lat1 = toRadians(coords1[1]);
	const lon1 = toRadians(coords1[0]);
	const lat2 = toRadians(coords2[1]);
	const lon2 = toRadians(coords2[0]);
	const dLat = lat2 - lat1;
	const dLon = lon2 - lon1;
	const a = Math.sin(dLat / 2) ** 2 +
			  Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c; // Distance in meters
}

let trail = [];
let trailDistance = 0;
let trailClimb = 0;
let trailDescent = 0;
const distanceBox = document.createElement('div');
distanceBox.className = 'distance-box showHide';
map.getContainer().appendChild(distanceBox);
const climbBox = document.createElement('div');
climbBox.className = 'climb-box showHide';
map.getContainer().appendChild(climbBox);
const timeBox = document.createElement('div');
timeBox.className = 'time-box showHide';
map.getContainer().appendChild(timeBox);
const avgspeedBox = document.createElement('div');
avgspeedBox.className = 'avgspeed-box showHide';
map.getContainer().appendChild(avgspeedBox);
const speedBox = document.createElement('div');
speedBox.className = 'speed-box showHide'; 
map.getContainer().appendChild(speedBox);
const elevBox = document.createElement('div');
elevBox.className = 'elevation-box showHide'; 
map.getContainer().appendChild(elevBox);
elevBox.addEventListener('click', function() {
	metric = !metric;
});

let startTime = Date.now();

setInterval(() => {
	const elapsed = Math.floor((Date.now() - startTime) / 1000);
	const h = Math.floor(elapsed / 3600);
	const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
	const s = (elapsed % 60).toString().padStart(2, '0');
	timeBox.innerHTML = `<span style="font-size:50%;">Timer </span>0${h}:${m}:${s}`;
}, 1000);
timeBox.addEventListener('click', function() {
	startTime = Date.now();
	trail = [];
	trailDistance = 0;
	trailClimb = 0;
	trailDescent = 0;
	timeBox.innerHTML = '<span style="font-size:50%;">Timer </span>0:00:00';
	avgspeedBox.innerHTML = '<span style="font-size:50%;">Avg </span>0.0 ' + (metric?'kph':'mph');
	distanceBox.innerHTML = '<span style="font-size:50%;">Dist </span>0' + (metric?' m':"'");
	climbBox.innerHTML = '<span style="font-size:50%;">Climb </span>0/0' + (metric?' m':"'");
});

function updateTrail() {
	if (map.getSource('trail')) {
		map.getSource('trail').setData({
			'type': 'Feature',
			'geometry': {
				'type': 'LineString',
				'coordinates': trail
			}
		});
		
		let meters = trailDistance;
		const seconds = Math.floor((Date.now() - startTime) / 1000);
		distanceBox.innerHTML = '<span style="font-size:50%;">Dist </span>';
		avgspeedBox.innerHTML = '<span style="font-size:50%;">Avg </span>';
		let avgSpd;
		if (metric) {
			avgSpd = meters/seconds*3.6;
			if (meters<1000) distanceBox.innerHTML += meters.toFixed(0) + ' m';
			else if (meters<10000) distanceBox.innerHTML += (meters/1000).toFixed(2) + ' km';
			else distanceBox.innerHTML += (meters/1000).toFixed(1) + ' km';
			avgspeedBox.innerHTML += `${avgSpd.toFixed(1)} kph`;
		} else {
			let feet = meters*3.28;
			avgSpd = feet/5280/seconds*3600;
			if (feet<5280/4) distanceBox.innerHTML += feet.toFixed(0) + "'";
			else if (feet<10000) distanceBox.innerHTML += (feet/5280).toFixed(2) + ' mi';
			else distanceBox.innerHTML += (feet/5280).toFixed(1) + ' mi';
			avgspeedBox.innerHTML += `${(avgSpd).toFixed(1)} mph`;
		}
	} else {
		map.addSource('trail', {
			'type': 'geojson',
			'data': {
				'type': 'Feature',
				'geometry': {
					'type': 'LineString',
					'coordinates': trail
				}
			}
		});
		map.addLayer({
			'id': 'trail',
			'type': 'line',
			'source': 'trail',
			'layout': {
				'line-join': 'round',
				'line-cap': 'round'
			},
			'paint': {
				'line-color': 'cadetblue',
				'line-width': 5
			}
		});
	}
}

// Handle 'follow' toggle
document.getElementById('follow').addEventListener('change', (e) => {
	follow = e.target.checked;
});

function formatMins(minutesFloat) {
	const minutes = Math.floor(minutesFloat);
	const seconds = Math.round((minutesFloat % 1) * 60).toString().padStart(2, '0');
	return `${minutes}'${seconds}"`;
}

// Create the custom marker element
/*const userMarkerElement = document.createElement('div');
userMarkerElement.innerHTML = `
	<svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="red" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		 <polygon points="12 2 19 21 12 17 5 21 12 2"></polygon>
	</svg>`;
userMarkerElement.style.transformOrigin = 'center center';
*/

let lat,lng;
navigator.geolocation.watchPosition(position => {
	lat = position.coords.latitude;
	lng = position.coords.longitude;
	const alt = position.coords.altitude || 0;
	const speed = position.coords.speed * 3.6 || 0;
	const heading = position.coords.heading || 0;
	const accuracy = position.coords.accuracy || 0;
	//let compass = null;
	const zoomLevel = map.getZoom();

	// Update user marker
	if (!userMarker) {
		userMarker = new mapboxgl.Marker({
			color: 'red',
			rotationAlignment: 'map'
		}).setLngLat([lng, lat]).addTo(map);
	}
	userMarker.setLngLat([lng, lat]);
	userMarker.setRotation(180 + heading);
	if (follow) {
		map.setCenter([lng, lat]);
		if (speed > 1) {
			map.easeTo({
				bearing: heading,
				duration: 200
			});
		}
	}
	updateAccuracyCircle([lng, lat], accuracy);

	elevBox.innerHTML = '<span style="font-size:50%;">Elev </span>';
	elevBox.innerHTML += (metric) ? alt.toFixed(0) + 'm' : (alt*3.28).toFixed(0) + "'";
	
	if (speed > 1) {
		if (!metric) speed = speed / 1.609;
		let speedText = (speed < 20) ? `${speed.toFixed(1)}` : `${speed.toFixed(0)}`;
		speedText += (metric) ? ' kph' : ' mph';
		speedBox.innerHTML = speedText + '<span style="font-size:50%;line-height:0.8;"><br><b>HDG ' + 
							 heading.toFixed(0).padStart(3,'0') + "&deg;</span>";
	} else {
		speedBox.innerHTML = '';
	}

	// Update trail
	if (Math.sqrt(((lat - lastlat) * 111320) ** 2 + ((lng - lastlng) * 111320) ** 2) > 3) {
		const trailPoint = [lng, lat, alt];
		trailDistance += haversineDist([lastlng, lastlat, lastalt], trailPoint);
		trail.push(trailPoint);
		if (alt > lastalt) {
			trailClimb += alt - lastalt;
		} else {
			trailDescent += lastalt - alt;
		}
		if (trailClimb == 0) climbBox.innerHTML = '';
		else {
			climbBox.innerHTML = '<span style="font-size:50%;">Climb </span>';
			climbBox.innerHTML += (metric) ? trailClimb.toFixed(0) + '/' + trailDescent.toFixed(0) + "m"
								: (trailClimb*3.28).toFixed(0) + '/' + (trailDescent*3.28).toFixed(0) + "'";
		}
		updateTrail();
		lastlat = lat;
		lastlng = lng;
		lastalt = alt;
	}
}, (error) => {
	console.error('Error watching position:', error);
}, {
	enableHighAccuracy: true
});

// Update compass arrow for device orientation
if (window.DeviceOrientationEvent) {
	window.addEventListener('deviceorientationabsolute', function(event) {
		if (event.alpha !== null) {
			let compass = -(event.alpha + event.beta * event.gamma / 90);
			compass -= Math.floor(compass / 360) * 360;
			updateCompassArrow([lng, lat], compass);
		} else {
			updateCompassArrow([0, 0], 0);
		}
	});
} else {
	updateCompassArrow([0, 0], 0);
}

// Add a layer for the breadcrumb trail
map.on('load', () => {
	map.addSource('mapbox-dem', {
		'type': 'raster-dem',
		'url': 'mapbox://mapbox.terrain-rgb',
		'tileSize': 512,
		'maxzoom': 14
	});
	map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1 });
	map.addSource('trail', {
		type: 'geojson',
		data: {
			type: 'FeatureCollection',
			features: []
		}
	});
	map.addLayer({
		id: 'trail',
		type: 'line',
		source: 'trail',
		layout: {
			'line-join': 'round',
			'line-cap': 'round'
		},
		paint: {
			'line-color': '#888',
			'line-width': 4
		}
	});
});

document.getElementById('hideControls').addEventListener('change', (e) => {
	const hideControls = e.target.checked ? 'none' : 'block';
	const hideControl2 = e.target.checked ? 'none' : 'visible';
	
	const navCtrlElm = map._controls.find(ctrl => ctrl instanceof mapboxgl.NavigationControl)._container;
	navCtrlElm.style.display = hideControls;

	const divs = document.querySelectorAll('.showHide'); // Give the divs this class
	divs.forEach(div => {
		div.style.display = hideControls;
	});
	if (userMarker) userMarker.getElement().style.display = hideControls;
	if (map.getLayer('accuracyCircle')) 
		map.setLayoutProperty('accuracyCircle', 'visibility', hideControl2);
	if (map.getLayer('compassArrow')) 
		map.setLayoutProperty('compassArrow', 'visibility', hideControl2);
	if (map.getLayer('trail')) 
		map.setLayoutProperty('trail', 'visibility', hideControl2);
});

document.getElementById('hideActivities').addEventListener('change', (e) => {
	const hideControls = e.target.checked ? 'none' : 'block';
	const hideControl2 = e.target.checked ? 'none' : 'visible';

	// Show/Hide actvities in layers
	const layers = map.getStyle().layers;
	if (layers) {
		layers.forEach(layer => {
			if (layer.id.startsWith('activity-layer-')) {
				map.setLayoutProperty(layer.id, 'visibility', hideControl2);
			}
		});
	}
	
	// Toggle route markers (keep route polyline visible)
	markers.forEach(marker => {
		if (marker?.getElement()) {
			marker.getElement().style.display = hideControls;
		}
	});
	midMarkers.forEach(marker => {
		if (marker?.getElement()) {
			marker.getElement().style.display = hideControls;
		}
	});

});
