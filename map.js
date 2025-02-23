mapboxgl.accessToken = 'pk.eyJ1IjoiaXNoYWFuayIsImEiOiJjbTdnMmh6bGMwd2c4Mm1wdnZ1ZXB3YWs5In0.8OJUfDxR3UOPHT7e0qzPcQ';

let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18
});

map.on('load', () => {
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
  });
  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
  });
  map.addLayer({
    id: 'boston-lanes',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': '#32D400',
      'line-width': 5,
      'line-opacity': 0.6
    }
  });
  map.addLayer({
    id: 'cambridge-lanes',
    type: 'line',
    source: 'cambridge_route',
    paint: {
      'line-color': '#32D400',
      'line-width': 5,
      'line-opacity': 0.6
    }
  });
});

function computeStationTraffic(stations, trips) {
  const departures = d3.rollup(
    trips,
    v => v.length,
    d => d.start_station_id
  );
  const arrivals = d3.rollup(
    trips,
    v => v.length,
    d => d.end_station_id  
  );
  return stations.map(station => {
    let id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });
}

function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString('en-US', { timeStyle: 'short' });
}

map.on('load', () => {
  const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
  d3.json(jsonurl).then(async jsonData => {
    let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);
    console.log('Loaded JSON Data:', jsonData);

    let trips = await d3.csv(
      'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
      (trip) => {
        trip.started_at = new Date(trip.started_at);
        trip.ended_at = new Date(trip.ended_at);
        return trip;
      }
    );

    const stations = computeStationTraffic(jsonData.data.stations, trips);
    console.log('Stations Array:', stations);

    const svg = d3.select('#map').select('svg');

    function getCoords(station) {
      const point = new mapboxgl.LngLat(+station.lon, +station.lat);
      const { x, y } = map.project(point);
      return { cx: x, cy: y };
    }

    const circles = svg.selectAll('circle')
      .data(stations, d => d.short_name)
      .enter()
      .append('circle')
      .attr('class', 'station-circle')
      .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic));

    function updatePositions() {
      circles
        .attr('cx', d => getCoords(d).cx)
        .attr('cy', d => getCoords(d).cy);
    }
    updatePositions();
    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);

    const radiusScale = d3.scaleSqrt()
      .domain([0, d3.max(stations, d => d.totalTraffic)])
      .range([0, 25]);

    circles
      .attr('r', d => radiusScale(d.totalTraffic))
      .style('fill-opacity', '60%')
      .each(function(d) {
        d3.select(this)
          .append('title')
          .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
      })
      .style('pointer-events', 'auto')
      .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic));

    const timeSlider = document.querySelector('#time-slider');
    const selectedTime = document.querySelector('#time-display');
    const anyTimeLabel = document.querySelector('.time-any');

    function minutesSinceMidnight(date) {
      return date.getHours() * 60 + date.getMinutes();
    }

    function filterTripsbyTime(trips, timeFilter) {
      return timeFilter === -1
        ? trips
        : trips.filter(trip => {
            const startedMinutes = minutesSinceMidnight(trip.started_at);
            const endedMinutes = minutesSinceMidnight(trip.ended_at);
            return (
              Math.abs(startedMinutes - timeFilter) <= 60 ||
              Math.abs(endedMinutes - timeFilter) <= 60
            );
          });
    }

    function updateScatterPlot(timeFilter) {
      const filteredTrips = filterTripsbyTime(trips, timeFilter);
      const filteredStations = computeStationTraffic(stations, filteredTrips);

      if (timeFilter === -1) {
        radiusScale.range([0, 25]);
      } else {
        radiusScale.range([3, 50]);
      }

      circles
        .data(filteredStations, d => d.short_name)
        .join('circle')
        .attr('class', 'station-circle')
        .attr('r', d => radiusScale(d.totalTraffic))
        .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic))
        .each(function(d) {
          d3.select(this).select('title')
            .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
        });
    }

    function updateTimeDisplay() {
      let timeFilterValue = Number(timeSlider.value);
      if (timeFilterValue === -1) {
        selectedTime.textContent = '';
        anyTimeLabel.style.display = 'block';
      } else {
        selectedTime.textContent = formatTime(timeFilterValue);
        anyTimeLabel.style.display = 'none';
      }
      updateScatterPlot(timeFilterValue);
    }

    timeSlider.addEventListener('input', updateTimeDisplay);
    updateTimeDisplay();

  }).catch(error => {
    console.error('Error loading JSON:', error);
  });
});

console.log(map);
