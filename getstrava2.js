const colorMap = {
	"Ride": "#0000FF", // Blue
	"EBikeRide": "#0000FF", // Blue
	"Run": "#FF0000", // Red
	"Walk": "#800080", // Purple
	"Hike": "#800080", // Purple
	"Golf": "#800080", // Purple
	"Canoeing": "#008000", // Green
	"Kayaking": "#008000", // Green
	"Kitesurf": "#008000", // Green
	"WaterSport": "#00A000", // LtGreen
	"Rowing": "#008000", // Green
	"Swim": "#008000", // Green
	"Sail": "#008000", // Green
	"Surfing": "#008000", // Green
	"StandUpPaddling": "#008000", // Green
	"AlpineSki": "#FFA500", // Orange
	"IceSkate": "#FFA500", // Orange
	"InlineSkate": "#FFA500", // Orange
	"BackcountrySki": "#FFA500", // Orange
	"NordicSki": "#FFA500", // Orange
	"Snowboard": "#FFA500", // Orange
	"Snowshoe": "#FFA500" // Orange
};
let myColorMap = {};
let tempColorMap = {};
const decodedPolylineCache = new Map();
let activitySourceData = {};
const activityLayerHandlers = new Set();

// Handle the button click
authorizeBtn.addEventListener('click', function () {
	// Redirect to authorization URL
	const clientId = '108742';
	const redirectUri = window.location.href; // Same page
	const authorizeUrl = 'https://www.strava.com/oauth/authorize';
	const scope = 'activity:read_all';
	const authUrl = `${authorizeUrl}?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&approval_prompt=auto&scope=${scope}`;
	window.location.href = authUrl;
});

// Check for authorization code in URL
const params = new URLSearchParams(window.location.search);
const code = params.get('code');
const getId = params.get('id');
var activityData = [];
var athleteId = null;
var lastId;

map.on('load', () => {
	loadData();
	
	// load json for id in URL params
	if (getId) { 
		athleteId = getId;
		notSaved = true;
		athleteIdElement.innerHTML = 'ID '+athleteId;
	} else if (code) {
		// Exchange authorization code for access token
		authorizeBtn.innerHTML = 'Getting token';
		fetch('exchange_token.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: `code=${code}`
		})
		.then(response => response.json())
		.then(data => {
			if (data.access_token) {
				notSaved = true;
				athleteId = data.athlete.id;
				athleteIdElement.innerHTML = 'ID '+athleteId;
				
				// if loadData, update it
				// if no loadData, fetch it and save it
				
				lastId = activityData.length === 0 ? 0 : activityData[0].id;
				authorizeBtn.innerHTML = 'Fetching update';
				fetchPage(data.access_token);
			} else {
				alert('Failed to obtain access token:', data);
			}
		})
		.catch(error => alert('Error exchanging token:', error));
	}
});

// Function to fetch activities asynchronously
async function fetchPage(accessToken, page = 1, anyAdded = false) {
	try {
		const response = await fetch(`fetch_activities.php?access_token=${accessToken}&page=${page}`);
		if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

		const text = await response.text();
		let activities = [];
		if (text.trim()) {
			activities = JSON.parse(text);
		}

		let i = 0;
		let addedThisPage = false;
		
		//alert('lastId '+lastId+'.  activities[0]='+JSON.stringify(activities[0]));
		
		if (Array.isArray(activities) && activities.length > 0 && activities[i].id > lastId) {
			while (i < activities.length && activities[i].id > lastId) {
				activityData.splice(i + (page - 1) * 100, 0, activities[i]);
				i++;
				addedThisPage = true;
			}
			appendActivities(activities.slice(0, i));

			authorizeBtn.innerHTML = (i + (page - 1) * 100) + ' updated';

			// Always continue to next page if current page had *any* activities
			return fetchPage(accessToken, page + 1, anyAdded || addedThisPage);
		}

		// No more pages
		if (anyAdded || addedThisPage) {
			saveData();
			scrollToLatestActivity();
			authorizeBtn.innerHTML = activityData.length + ' updated';
		} else {
			authorizeBtn.innerHTML = activityData.length + ' (no updates)';
		}

	} catch (error) {
		alert('Failed to load activities:\n' + error.message);
	}
}

function scrollToLatestActivity() {
	if (activityData.length === 0) return;

	const lastActivity = activityData[0]; // Most recent is first
	const polyline = lastActivity.map.summary_polyline;
	if (!polyline) return;

	const coordinates = polylineToCoordinates(polyline);
	if (coordinates.length === 0) return;

	const bounds = coordinates.reduce(
		(b, coord) => b.extend(coord),
		new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
	);

	map.fitBounds(bounds, { padding: 20 });
}

//delete the cache
function deleteCache() {
	activityData = [];
	myColorMap = {};
	tempColorMap = {};
	activitySourceData = {};
	decodedPolylineCache.clear();
	localStorage.removeItem('strava_data');
	authorizeBtn.innerHTML = 'No cache';

	const layers = map.getStyle().layers;
	if (!layers) return;
	clearActivityLayers();
}

// Function to fetch activity data for a given athlete ID using GET
function loadData() {
	activityData = [];
	
	if (localStorage.getItem('strava_data')) {
		authorizeBtn.innerHTML = 'Update from cache';
		const data = JSON.parse(localStorage.getItem('strava_data'));
		
		// **if first record is colorMap, then put that into myColorMap and pop the item from the array
		if (data[0].hasOwnProperty('type')) {
			activityData = data;
		} else {
			[myColorMap, ...activityData] = data;
			tempColorMap = { ...myColorMap }; // Temp copy to hold changes
		}
		authorizeBtn.innerHTML = 'Drawing '+activityData.length;
		drawActivities(activityData);
		// activityData loaded
		authorizeBtn.innerHTML = activityData.length + '. Update?';
	} else {
		authorizeBtn.innerHTML = 'Authorise Strava';
	}
}

function saveData() {
	const minimalData = activityData.map(a => ({
		id: a.id,
		type: a.type,
		name: a.name,
		start_date: a.start_date,
		distance: a.distance,
		moving_time: a.moving_time,
		total_elevation_gain: a.total_elevation_gain,
		map: { summary_polyline: a.map?.summary_polyline || '' }
	}));

	const jsonData = JSON.stringify([myColorMap, ...minimalData]);

	try {
		localStorage.setItem('strava_data', jsonData);
		authorizeBtn.innerHTML = activityData.length + ' saved';
	} catch (e) {
		alert('Exceeded localStorage quota. Too many activities.');
	}
}

function getActivityColor(activity) {
	const color = myColorMap[activity.type] || colorMap[activity.type] || "#777777"; // Default to grey if no match
	if (!myColorMap.hasOwnProperty(activity.type)) {
		myColorMap[activity.type] = color;
	}
	return color;
}

function buildActivityFeature(activity) {
	const polyline = activity.map?.summary_polyline;
	if (!polyline) return;

	const coordinates = polylineToCoordinates(polyline);
	if (coordinates.length === 0) return;

	return {
		'type': 'Feature',
		'properties': { 
			'uid': activity.id,
			'details': activity.start_date.substring(0,10) + '<br>' +
					(activity.distance/1000).toFixed(1) + ' km ' + activity.type + '<br>' +
					activity.name
		},
		'geometry': {
			'type': 'LineString',
			'coordinates': coordinates
		}
	};
}

function applyActivityVisibility(sourceId) {
	if (!map.getLayer(sourceId)) return;
	const hideActivities = document.getElementById('hideActivities')?.checked;
	map.setLayoutProperty(sourceId, 'visibility', hideActivities ? 'none' : 'visible');
}

function ensureActivityLayer(color) {
	const sourceId = `activity-layer-${color}`;

	if (!activitySourceData[sourceId]) {
		activitySourceData[sourceId] = {
			'type': 'FeatureCollection',
			'features': []
		};
	}

	if (!map.getSource(sourceId)) {
		map.addSource(sourceId, {
			'type': 'geojson',
			'data': activitySourceData[sourceId]
		});
	}

	if (!map.getLayer(sourceId)) {
		map.addLayer({
			'id': sourceId,
			'type': 'line',
			'source': sourceId,
			'layout': {
				'line-join': 'round',
				'line-cap': 'round'
			},
			'paint': {
				'line-color': color,
				'line-width': 1,
				'line-opacity': 0.8
			}
		});
	}

	applyActivityVisibility(sourceId);

	if (!activityLayerHandlers.has(sourceId)) {
		map.on('click', sourceId, (e) => {
			const uid = e.features[0].properties.uid;
			const details = e.features[0].properties.details;
			const coordinates = e.lngLat; // Get the clicked coordinates

			new mapboxgl.Popup()
				.setLngLat([coordinates.lng, coordinates.lat])
				.setHTML('Strava: <a href="https://www.strava.com/activities/' + uid + '">' + uid + '</a><br>' + details)
				.addTo(map);
		});
		map.on('mouseenter', sourceId, () => {
			map.getCanvas().style.cursor = 'pointer';
		});
		map.on('mouseleave', sourceId, () => {
			map.getCanvas().style.cursor = '';
		});
		activityLayerHandlers.add(sourceId);
	}

	return sourceId;
}

function appendActivities(activities) {
	const changedSourceIds = new Set();

	activities.forEach(activity => {
		const color = getActivityColor(activity);
		const feature = buildActivityFeature(activity);
		if (!feature) return;

		const sourceId = ensureActivityLayer(color);
		activitySourceData[sourceId].features.push(feature);
		changedSourceIds.add(sourceId);
	});

	changedSourceIds.forEach(sourceId => {
		if (map.getSource(sourceId)) {
			map.getSource(sourceId).setData(activitySourceData[sourceId]);
		}
	});
}

function clearActivityLayers() {
	const layers = map.getStyle().layers;
	if (!layers) return;

	for (const layer of [...layers]) {
		if (layer.id.startsWith('activity-layer-') && map.getLayer(layer.id)) {
			map.removeLayer(layer.id);
		}
		if (layer.id.startsWith('activity-layer-') && map.getSource(layer.id)) {
			map.removeSource(layer.id);
		}
	}
}

function drawActivities(activities) {
	clearActivityLayers();
	activitySourceData = {};
	appendActivities(activities);
}

// Function to plot activity polylines. Kept for existing callers; bulk loads should use drawActivities().
function plotActivity(activity) {
	appendActivities([activity]);
}

// Function to decode a Google Maps polyline
function polylineToCoordinates(polyline) {
	if (decodedPolylineCache.has(polyline)) {
		return decodedPolylineCache.get(polyline);
	}

	let index = 0, lat = 0, lng = 0, coordinates = [];
	while (index < polyline.length) {
		let b, shift = 0, result = 0;
		do {
			b = polyline.charCodeAt(index++) - 63;
			result |= (b & 0x1f) << shift;
			shift += 5;
		} while (b >= 0x20);
		const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
		lat += dlat;

		shift = 0;
		result = 0;
		do {
			b = polyline.charCodeAt(index++) - 63;
			result |= (b & 0x1f) << shift;
			shift += 5;
		} while (b >= 0x20);
		const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
		lng += dlng;

		coordinates.push([lng / 1E5, lat / 1E5]);
	}
	decodedPolylineCache.set(polyline, coordinates);
	return coordinates;
}

// handle color button click
colorBtn.addEventListener('click', () => {
	const colorInputs = document.getElementById('colorInputs');
	colorInputs.innerHTML = ''; // Clear previous content

	Object.keys(tempColorMap).forEach(activity => {
		const colorInput = `
			<div class="item">
				<input type="color" id="${activity}" value="${tempColorMap[activity]}"
					onchange="updateTempColor('${activity}', this.value)">
				<label for="${activity}">${activity.charAt(0).toUpperCase() + activity.slice(1)}</label>
			</div>`;
		colorInputs.innerHTML += colorInput;
	});

	document.getElementById('popup').style.display = 'block';
	document.getElementById('overlay').style.display = 'block';
});

function closePopup() {
	tempColorMap = { ...myColorMap }; // Reset changes
	document.getElementById('popup').style.display = 'none';
	document.getElementById('overlay').style.display = 'none';
}
function saveColors() {
	Object.assign(myColorMap, tempColorMap); // Save changes
	saveData();
	drawActivities(activityData);
	closePopup();
}
function updateTempColor(activity, color) {
	tempColorMap[activity] = color;
}
