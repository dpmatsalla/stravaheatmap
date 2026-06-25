var markers = [];
var midMarkers = [];
var selectCircle = -1;
var routing = true;
var routeDragFrame = null;

const routeDistBox = document.createElement('div');
routeDistBox.className = 'route-dist-box showHide';
map.getContainer().appendChild(routeDistBox);
const routeClimbBox = document.createElement('div');
routeClimbBox.className = 'route-climb-box showHide';
map.getContainer().appendChild(routeClimbBox);

// Handle 'routing' toggle
document.getElementById('routing').addEventListener('change', (e) => {
	routing = e.target.checked;
	updatePopups();
	if (routing) {
		map.on('click', addMarker);
		markers.forEach(marker => {
			marker.setDraggable(true);
			marker.on('drag', handleMarkerDrag);
			marker.on('dragend', handleMarkerDragEnd);
		});
	} else {
		map.off('click', addMarker);
		markers.forEach(marker => {
			marker.off('drag', handleMarkerDrag);
			marker.off('dragend', handleMarkerDragEnd);
			marker.setDraggable(false);
		});
	}
});

map.on('click', addMarker);

function haversineDistance(lnglat1, lnglat2) {
	const R = 6371000; // Radius of the Earth in m
	const dLat = (lnglat2.lat - lnglat1.lat) * Math.PI / 180;
	const dLon = (lnglat2.lng - lnglat1.lng) * Math.PI / 180;
	const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
			Math.cos(lnglat1.lat * Math.PI / 180) * Math.cos(lnglat2.lat * Math.PI / 180) *
			Math.sin(dLon / 2) * Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

async function updateRouteLength() {
	var totalLength = 0;
	var totalClimb = 0;
	var totalDescent = 0;
	const intervalDistance = 100; // 100 meters
	
	if (markers.length > 0) {
		for (var i = 0; i < markers.length - 1; i++) {
			const start = markers[i].getLngLat();
			const end = markers[i + 1].getLngLat();
			const segmentLength = haversineDistance(start, end);
			totalLength += segmentLength;
	
			// Calculate number of intervals for this segment
			const numIntervals = Math.floor(segmentLength / intervalDistance);
			if (numIntervals === 0) continue;
	
			let previousElevation = await map.queryTerrainElevation(start);
			for (let j = 1; j <= numIntervals; j++) {
				// Interpolate along the segment at 100m intervals
				const fraction = j / numIntervals;
				const interpolatedLngLat = interpolateLngLat(start, end, fraction);
	
				// Query terrain elevation at the interpolated point
				const currentElevation = await map.queryTerrainElevation(interpolatedLngLat);
	
				// Calculate climb/descent
				if (currentElevation > previousElevation) {
					totalClimb += currentElevation - previousElevation;
				} else {
					totalDescent += previousElevation - currentElevation;
				}
	
				previousElevation = currentElevation;
			}
		}
	
		// Update the HTML with the results
		routeDistBox.innerHTML = '<span style="font-size:50%;">Route </span>';
		routeClimbBox.innerHTML = '<span style="font-size:50%;">Climb </span>';
		if (metric) {
			if (totalLength < 1000) routeDistBox.innerHTML += totalLength.toFixed(0) + ' m';
			else if (totalLength < 10000) routeDistBox.innerHTML += (totalLength / 1000).toFixed(2) + ' km';
			else routeDistBox.innerHTML += (totalLength / 1000).toFixed(1) + ' km';
			routeClimbBox.innerHTML += totalClimb.toFixed(0) + '/' + totalDescent.toFixed(0) + ' m';
		} else {
			totalLength *= 3.28;
			if (totalLength < 5280/4) routeDistBox.innerHTML += totalLength.toFixed(0) + "'";
			else if (totalLength < 10000) routeDistBox.innerHTML += (totalLength / 5280).toFixed(2) + ' mi';
			else routeDistBox.innerHTML += (totalLength / 5280).toFixed(1) + ' mi';
			routeClimbBox.innerHTML += (totalClimb*3.28).toFixed(0) + '/' + (totalDescent*3.28).toFixed(0) + "'";
		}
	} else {
		routeDistBox.innerHTML = '';
		routeClimbBox.innerHTML = '';
	}

}

// Helper function to interpolate between two points
function interpolateLngLat(start, end, fraction) {
	const lng = start.lng + (end.lng - start.lng) * fraction;
	const lat = start.lat + (end.lat - start.lat) * fraction;
	return new mapboxgl.LngLat(lng, lat);
}

// Your existing haversineDistance function stays unchanged
function createMarker(index, lnglat) {
	var el = document.createElement('div');
	el.className = 'marker';
	el.style.backgroundColor = 'rgba(255,100,0,0.4)';
	el.style.width = '28px';
	el.style.height = '28px';
	el.style.borderRadius = '50%';
	var marker = new mapboxgl.Marker(el, { draggable: true })
		.setLngLat([lnglat.lng, lnglat.lat])
		.addTo(map);
	marker.elevation = map.queryTerrainElevation(lnglat, { exaggerated: false });
	marker.setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML("<center>P" + 
			index + ": " + lnglat.lat.toFixed(5) + ", " + lnglat.lng.toFixed(5) + 
			//'<br>Elev ' + marker.elevation.toFixed(0) + ' m' +
			"<br><a href='#' onclick='deleteMarker(" + index + ")'>Delete</a></center>"));
	marker.on('drag', handleMarkerDrag);
	marker.on('dragend', handleMarkerDragEnd);
	markers.splice(index - 1, 0, marker);
	
	updateAll(); //this will reset popup content anyways
}

function updateAll() {
	updatePolyline();
	updateMidpointMarkers();
	updateRouteLength();
	updatePopups();
}

function handleMarkerDrag() {
	if (routeDragFrame) return;

	routeDragFrame = requestAnimationFrame(() => {
		routeDragFrame = null;
		updatePolyline();
		updateMidpointMarkers();
	});
}

function handleMarkerDragEnd() {
	if (routeDragFrame) {
		cancelAnimationFrame(routeDragFrame);
		routeDragFrame = null;
	}
	updateAll();
}

function addMarker(e) {
	// Check if the clicked element is a marker or a popup, if so, do not add a marker
	if (e.originalEvent.target.classList.contains('marker') || 
		e.originalEvent.target.classList.contains('mapboxgl-popup-content') || 
		e.originalEvent.target.classList.contains('midMarker')) {
		return;
	}
	if (selectCircle > -1) {
		selectCircle = -1;
		return;
	}
	var index = markers.length + 1;
	createMarker(index, e.lngLat);
	notSaved = true;
}

function updatePopups() {
	for (var i = 0; i < markers.length; i++) {
		var index = i + 1;
		markers[i].elevation = map.queryTerrainElevation(markers[i].getLngLat(), { exaggerated: false });
		var txt = "<center>P" + index + ": " + 
			markers[i].getLngLat().lat.toFixed(5) + ', ' +
			markers[i].getLngLat().lng.toFixed(5);
		if (markers[i].elevation) txt += '<br>Elev ' + markers[i].elevation.toFixed(0) + ' m';
		if (routing) txt += "<br><a href='#' onclick='deleteMarker(" + 
			index + ")'>Delete</a></center>";
		markers[i].getPopup().setHTML(txt);
	}
}

function updateMidpointMarkers() {
	// Add midpoint markers between each pair of markers
	for (let i = 0; i < markers.length - 1; i++) {
		var midLngLat = new mapboxgl.LngLat(
			(markers[i].getLngLat().lng + markers[i + 1].getLngLat().lng) / 2,
			(markers[i].getLngLat().lat + markers[i + 1].getLngLat().lat) / 2
		);
		if (!midMarkers[i]) {
			var el = document.createElement('div');
			el.className = 'midMarker';
			el.style.backgroundColor = 'rgba(0,100,255,0.4)';
			el.style.width = '18px';
			el.style.height = '18px';
			el.style.borderRadius = '50%';
			el.addEventListener('click', () => clickMidMarker(i));
			midMarkers[i] = new mapboxgl.Marker(el)
				.setLngLat(midLngLat)
				.addTo(map);
		} else {
			midMarkers[i].setLngLat(midLngLat);
		}
	}
}

function clickMidMarker(i) {
	if (routing) {
		selectCircle = i;
		createMarker(i + 2, midMarkers[i].getLngLat());
	}
}

function deleteMarker(index) {
	markers[index - 1].remove();
	markers.splice(index - 1, 1);
	if (midMarkers[index - 1]) {
		midMarkers[index - 1].remove();
		midMarkers.splice(index - 1, 1);
	} else if (midMarkers[index - 2]) {
		midMarkers[index - 2].remove();
		midMarkers.splice(index - 2, 1);
	}

	updateAll();
}

function updatePolyline() {
	if (markers.length > 0) {
		if (map.getSource('route')) {
			map.getSource('route').setData({
				'type': 'Feature',
				'geometry': {
					'type': 'LineString',
					'coordinates': markers.map(marker => marker.getLngLat().toArray())
				}
			});
		} else {
			map.addLayer({
				'id': 'route',
				'type': 'line',
				'source': {
					'type': 'geojson',
					'data': {
						'type': 'Feature',
						'geometry': {
							'type': 'LineString',
							'coordinates': markers.map(marker => marker.getLngLat().toArray())
						}
					}
				},
				'layout': {
					'line-join': 'round',
					'line-cap': 'round'
				},
				'paint': {
					'line-color': 'rgba(255,100,0,0.5)',
					'line-width': 4
				}
			});
		}
	}
}

// Function to handle the save button click
saveBtn.addEventListener('click', () => {
	// Gather the required data
	const mapCentre = map.getCenter();  // Assuming you have a Mapbox map instance
	const zoom = map.getZoom();
	const bearing = map.getBearing();
	const follow = document.getElementById('follow').checked;
	const routing = document.getElementById('routing').checked;
	const tileLayer = document.querySelector('input[name="tileLayer"]:checked').value;
  
	// Extract lngLat data from the markers array
	const markersLngLat = markers.map(marker => marker.getLngLat());

	// Prepare the data to be sent in the request body
	const data = {
		athleteId: athleteId,
		mapCentre: {
			lng: mapCentre.lng,
			lat: mapCentre.lat
		},
		zoom: zoom,
		bearing: bearing,
		follow: follow,
		routing: routing,
		tileLayer: tileLayer,
		markers: markersLngLat
	};
	
	// save to localStorage
	localStorage.setItem('map_data', JSON.stringify(data));
	alert(markers.length + ' markers saved');

});

// handle clear button click
document.getElementById('clearBtn').addEventListener('click', () => {
	if (markers.length > 0) {
		const confirm = window.confirm('Clear route?');
		if (!confirm) return;
	}
	// Clear existing markers and re-add saved markers
	for(var i=markers.length; i>0; i--) {
		deleteMarker(i);
	}
	routeDistBox.innerHTML = '';
	routeClimbBox.innerHTML = '';
});
	
// handle load button click
loadBtn.addEventListener('click', () => {
	if (markers.length > 0) {
		const confirm = window.confirm('Overwrite route?');
		if (!confirm) return;
	}
	
	// Retrieve from localStorage if it exists
	if (localStorage.getItem('map_data')) {
		const data = JSON.parse(localStorage.getItem('map_data'));
		
		// Reapply map centre and zoom
		map.setCenter([data.mapCentre.lng, data.mapCentre.lat]);
		map.setZoom(data.zoom);
		map.setBearing(data.bearing);
  
		// Set the follow and routing checkboxes
		document.getElementById('follow').checked = data.follow;
		follow = data.follow;
		const routingChkbox = document.getElementById('routing');
		if (routingChkbox.checked != data.routing) {
			routingChkbox.checked = data.routing;
			routingChkbox.dispatchEvent(new Event('change'));
		}

		// Clear existing markers and re-add saved markers
		for(var i=markers.length; i>0; i--) {
			deleteMarker(i);
		}

		data.markers.forEach((lngLat, i) => {
			createMarker(i+1, lngLat);
		});

		alert(markers.length + ' markers loaded successfully');
	} else {
		alert('No saved routes.  Save first.');
	}
});
