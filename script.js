/* =========================================================
   WEATHER-CAST — Sprint 03 Async JavaScript Module
   Phase 1: fetch + async/await + DOM injection
   Phase 2: search, try/catch error handling, dynamic icons
   Phase 3: geolocation, localStorage caching, animated backgrounds
   ========================================================= */

/* -----------------------------------------
   CONFIG
   Get a free key at https://openweathermap.org/api
   Store it as a variable — never hardcode it into
   every fetch string.

   NOTE: new keys can take up to 2 hours to activate.
   If you just signed up and get "invalid API key",
   that is almost always the reason — not a code bug.
------------------------------------------ */
const RAW_API_KEY = "63266e9c420908ea5367d8629ebf6e18";
const API_KEY = RAW_API_KEY.trim().replace(/["']/g, ""); // strips accidental quotes/whitespace
const BASE_URL = "https://api.openweathermap.org/data/2.5/weather";
const DEFAULT_CITY = "London";
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const FETCH_TIMEOUT_MS = 10000; // abort a hung request after 10s

function isApiKeyPlaceholder() {
  return !API_KEY || API_KEY === "YOUR_OPENWEATHERMAP_API_KEY";
}

function isApiKeyMalformed() {
  // OpenWeatherMap keys are 32-character lowercase hex strings.
  // This is a soft check to catch obvious paste errors early.
  return API_KEY.length !== 32;
}

/* -----------------------------------------
   DOM REFERENCES
------------------------------------------ */
const appBg = document.getElementById("appBg");
const searchForm = document.getElementById("searchForm");
const cityInput = document.getElementById("cityInput");
const locBtn = document.getElementById("locBtn");

const loader = document.getElementById("loader");
const errorBox = document.getElementById("errorBox");
const errorText = document.getElementById("errorText");
const weatherCard = document.getElementById("weatherCard");
const cacheNote = document.getElementById("cacheNote");

const cityNameEl = document.getElementById("cityName");
const dateTimeEl = document.getElementById("dateTime");
const weatherIconEl = document.getElementById("weatherIcon");
const temperatureEl = document.getElementById("temperature");
const conditionEl = document.getElementById("condition");
const humidityEl = document.getElementById("humidity");
const feelsLikeEl = document.getElementById("feelsLike");
const windEl = document.getElementById("wind");

/* -----------------------------------------
   UI STATE HELPERS
------------------------------------------ */
function showLoader() {
  loader.classList.remove("hidden");
  errorBox.classList.add("hidden");
  weatherCard.classList.add("hidden");
}

function hideLoader() {
  loader.classList.add("hidden");
}

function showError(message) {
  errorText.textContent = message;
  errorBox.classList.remove("hidden");
  weatherCard.classList.add("hidden");
  hideLoader();
}

function hideError() {
  errorBox.classList.add("hidden");
}

function setControlsDisabled(disabled) {
  document.getElementById("searchBtn").disabled = disabled;
  cityInput.disabled = disabled;
  locBtn.disabled = disabled;
}

/* -----------------------------------------
   BACKGROUND THEME (Phase 3 — stateful CSS)
------------------------------------------ */
function updateBackground(conditionMain) {
  const themes = ["clear", "clouds", "rain", "snow", "thunderstorm", "mist"];
  appBg.classList.remove(...themes);

  const key = (conditionMain || "").toLowerCase();

  if (key === "clear") {
    appBg.classList.add("clear");
  } else if (key === "clouds") {
    appBg.classList.add("clouds");
  } else if (key === "rain" || key === "drizzle") {
    appBg.classList.add("rain");
  } else if (key === "snow") {
    appBg.classList.add("snow");
  } else if (key === "thunderstorm") {
    appBg.classList.add("thunderstorm");
  } else if (["mist", "fog", "haze", "smoke"].includes(key)) {
    appBg.classList.add("mist");
  }
  // any other condition keeps the default gradient
}

/* -----------------------------------------
   LOCALSTORAGE CACHE (Phase 3)
------------------------------------------ */
function getCacheKey(query) {
  return `weathercast_${query.toLowerCase().trim()}`;
}

function readFromCache(query) {
  try {
    const raw = localStorage.getItem(getCacheKey(query));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const age = Date.now() - parsed.timestamp;

    if (age < CACHE_DURATION_MS) {
      return parsed.data;
    }
    // expired — clean it up
    localStorage.removeItem(getCacheKey(query));
    return null;
  } catch (err) {
    console.warn("Cache read failed:", err);
    return null;
  }
}

function writeToCache(query, data) {
  try {
    const payload = {
      timestamp: Date.now(),
      data: data,
    };
    localStorage.setItem(getCacheKey(query), JSON.stringify(payload));
  } catch (err) {
    console.warn("Cache write failed:", err);
  }
}

/* -----------------------------------------
   RENDER WEATHER DATA TO DOM
------------------------------------------ */
function renderWeather(data, fromCache = false) {
  cityNameEl.textContent = `${data.name}, ${data.sys?.country ?? ""}`;
  dateTimeEl.textContent = new Date().toLocaleString(undefined, {
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  const iconCode = data.weather?.[0]?.icon ?? "01d";
  weatherIconEl.src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
  weatherIconEl.alt = data.weather?.[0]?.description ?? "weather icon";
  weatherIconEl.onerror = () => {
    // Icon CDN failed to load — hide the broken-image icon gracefully
    weatherIconEl.style.display = "none";
  };
  weatherIconEl.onload = () => {
    weatherIconEl.style.display = "block";
  };

  temperatureEl.textContent = `${Math.round(data.main.temp)}°C`;
  conditionEl.textContent = data.weather?.[0]?.description ?? "--";
  humidityEl.textContent = `${data.main.humidity}%`;
  feelsLikeEl.textContent = `${Math.round(data.main.feels_like)}°C`;
  windEl.textContent = `${Math.round(data.wind?.speed ?? 0)} km/h`;

  updateBackground(data.weather?.[0]?.main);

  cacheNote.classList.toggle("hidden", !fromCache);
  weatherCard.classList.remove("hidden");
  hideError();
  hideLoader();
}

/* -----------------------------------------
   LOW-LEVEL FETCH WITH TIMEOUT
   Wraps fetch() with AbortController so a hung
   request doesn't spin the loader forever.
------------------------------------------ */
async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/* -----------------------------------------
   SHARED RESPONSE-STATUS HANDLING
   Every possible OpenWeatherMap failure mode
   mapped to a clear, user-facing message.
------------------------------------------ */
function messageForStatus(status) {
  switch (status) {
    case 400:
      return "That request wasn't understood. Try a simpler city name (e.g. 'Paris').";
    case 401:
      return "Invalid API key. If you just created it, wait up to 2 hours for it to activate, and make sure there's no extra space or quote around it in script.js.";
    case 404:
      return "City not found. Please check the spelling and try again.";
    case 429:
      return "Too many requests — you've hit the free-tier rate limit. Wait a minute and try again.";
    default:
      if (status >= 500) {
        return "The weather service is temporarily unavailable. Please try again shortly.";
      }
      return `Weather service error (status ${status}). Please try again.`;
  }
}

/* -----------------------------------------
   CORE FETCH FUNCTIONS (async/await + try/catch)
------------------------------------------ */
async function fetchWeatherByCity(city) {
  if (isApiKeyPlaceholder()) {
    showError("Add your OpenWeatherMap API key in script.js (API_KEY variable) to get started.");
    return;
  }
  if (isApiKeyMalformed()) {
    showError("Your API key looks malformed (should be a 32-character code). Double-check what you pasted in script.js.");
    return;
  }
  if (!navigator.onLine) {
    showError("You appear to be offline. Check your internet connection and try again.");
    return;
  }

  showLoader();
  setControlsDisabled(true);

  const cached = readFromCache(city);
  if (cached) {
    renderWeather(cached, true);
    setControlsDisabled(false);
    return;
  }

  const url = `${BASE_URL}?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`;

  try {
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(messageForStatus(response.status));
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("Received an unreadable response from the weather service. Please try again.");
    }

    writeToCache(city, data);
    renderWeather(data, false);
  } catch (err) {
    if (err.name === "AbortError") {
      showError("The request timed out. Please check your connection and try again.");
    } else if (err instanceof TypeError) {
      showError("Network error. Please check your connection and try again.");
    } else {
      showError(err.message);
    }
    console.error("fetchWeatherByCity failed:", err);
  } finally {
    setControlsDisabled(false);
  }
}

async function fetchWeatherByCoords(lat, lon) {
  if (isApiKeyPlaceholder()) {
    showError("Add your OpenWeatherMap API key in script.js (API_KEY variable) to get started.");
    return;
  }
  if (isApiKeyMalformed()) {
    showError("Your API key looks malformed (should be a 32-character code). Double-check what you pasted in script.js.");
    return;
  }
  if (!navigator.onLine) {
    showError("You appear to be offline. Check your internet connection and try again.");
    return;
  }

  showLoader();
  setControlsDisabled(true);

  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = readFromCache(cacheKey);
  if (cached) {
    renderWeather(cached, true);
    setControlsDisabled(false);
    return;
  }

  const url = `${BASE_URL}?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;

  try {
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(messageForStatus(response.status));
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("Received an unreadable response from the weather service. Please try again.");
    }

    writeToCache(cacheKey, data);
    renderWeather(data, false);
  } catch (err) {
    if (err.name === "AbortError") {
      showError("The request timed out. Please check your connection and try again.");
    } else if (err instanceof TypeError) {
      showError("Network error. Please check your connection and try again.");
    } else {
      showError(err.message);
    }
    console.error("fetchWeatherByCoords failed:", err);
  } finally {
    setControlsDisabled(false);
  }
}

/* -----------------------------------------
   GEOLOCATION (Phase 3)
------------------------------------------ */
function loadWeatherForCurrentLocation() {
  if (!("geolocation" in navigator)) {
    // Browser doesn't support geolocation at all
    fetchWeatherByCity(DEFAULT_CITY);
    return;
  }

  showLoader();

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      fetchWeatherByCoords(latitude, longitude);
    },
    (geoError) => {
      // GeolocationPositionError.code: 1 = PERMISSION_DENIED,
      // 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
      switch (geoError.code) {
        case 1:
          console.warn("User denied location permission.");
          break;
        case 2:
          console.warn("Location unavailable (no GPS/network signal).");
          break;
        case 3:
          console.warn("Location request timed out.");
          break;
        default:
          console.warn("Unknown geolocation error:", geoError.message);
      }
      // Graceful fallback to default city in every case
      fetchWeatherByCity(DEFAULT_CITY);
    },
    { timeout: 8000, maximumAge: 0 }
  );
}

/* -----------------------------------------
   EVENT LISTENERS
------------------------------------------ */
searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const city = cityInput.value.trim();

  if (!city) {
    showError("Please enter a city name.");
    return;
  }

  fetchWeatherByCity(city);
  cityInput.value = "";
});

locBtn.addEventListener("click", () => {
  loadWeatherForCurrentLocation();
});

/* -----------------------------------------
   INITIAL LOAD
------------------------------------------ */
window.addEventListener("DOMContentLoaded", () => {
  if (API_KEY === "YOUR_OPENWEATHERMAP_API_KEY") {
    showError("Add your OpenWeatherMap API key in script.js (API_KEY variable) to get started.");
    return;
  }
  loadWeatherForCurrentLocation();
});