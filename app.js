import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getDatabase, ref, onValue, set, remove } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";

// Firebase Configuration from User
const firebaseConfig = {
  apiKey: "AIzaSyC8hYSjdcnW3mV338Daipkz3Xi2CuRKKsA",
  authDomain: "pacific-wash.firebaseapp.com",
  projectId: "pacific-wash",
  storageBucket: "pacific-wash.firebasestorage.app",
  messagingSenderId: "1059151982301",
  appId: "1:1059151982301:web:54417630a461699753f534",
  measurementId: "G-VCY2BJTWK6",
  // Often needed explicitly to use Realtime DB unless using region-specific URLs
  databaseURL: "https://pacific-wash-default-rtdb.firebaseio.com"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const bookingsRef = ref(db, 'bookings');

// State
let currentUser = localStorage.getItem('pacificwash_user') || '';
let currentWeekOffset = 0; // 0 = this week, 1 = next week, -1 = last week
let bookings = {}; // This is now managed by Firebase!

// Elements - Auth
const authView = document.getElementById('authView');
const appView = document.getElementById('appView');
const loginNameInput = document.getElementById('loginNameInput');
const loginBtn = document.getElementById('loginBtn');
const currentUserDisplay = document.getElementById('currentUserDisplay');
const logoutBtn = document.getElementById('logoutBtn');

// Elements - App
const weekLabel = document.getElementById('weekLabel');
const prevWeekBtn = document.getElementById('prevWeek');
const nextWeekBtn = document.getElementById('nextWeek');
const mainContent = document.getElementById('mainContent');
const toast = document.getElementById('toast');

// Elements - Booking Modal
const modalOverlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');
const cancelBtn = document.getElementById('cancelBtn');
const confirmBtn = document.getElementById('confirmBtn');
const modalTitle = document.getElementById('modalTitle');
const modalSubtitle = document.getElementById('modalSubtitle');
const noteInput = document.getElementById('noteInput');

// Elements - Cancel Modal
const cancelOverlay = document.getElementById('cancelOverlay');
const cancelOverlayClose = document.getElementById('cancelOverlayClose');
const keepBtn = document.getElementById('keepBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
const cancelSubtitle = document.getElementById('cancelSubtitle');

// Active selection state
let activeBookingId = null; 
let activeSlotInfo = null;

// Slots Definition
const SLOTS = [
  { id: 'day', title: 'Day', time: '8:00 AM - 8:00 PM', icon: '☀️' },
  { id: 'overnight', title: 'Overnight', time: '8:00 PM - 8:00 AM', icon: '🌙' }
];

// Time utility functions
function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
  return new Date(d.setDate(diff));
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateDisplay(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDayName(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

// App Initialization
function init() {
  if (currentUser) {
    showApp();
  } else {
    showAuth();
  }
  setupEventListeners();

  // Listen to live database changes!
  onValue(bookingsRef, (snapshot) => {
    const data = snapshot.val();
    bookings = data || {};
    
    // If the user is logged in, update the view immediately
    if (currentUser) {
      renderWeek();
    }
  });
}

// Login flows
function showAuth() {
  authView.classList.remove('hidden');
  appView.classList.remove('visible');
  loginNameInput.focus();
}

function showApp() {
  authView.classList.add('hidden');
  appView.classList.add('visible');
  currentUserDisplay.textContent = currentUser;
  renderWeek();
}

function handleLogin() {
  const name = loginNameInput.value.trim();
  if (name.length < 2) {
    showToast('Please enter your name 🤗');
    return;
  }
  currentUser = name;
  localStorage.setItem('pacificwash_user', currentUser);
  showApp();
}

function handleLogout() {
  currentUser = '';
  localStorage.removeItem('pacificwash_user');
  loginNameInput.value = '';
  showAuth();
}

// Rendering
function renderWeek() {
  if (currentWeekOffset === 0) weekLabel.textContent = 'This Week';
  else if (currentWeekOffset === -1) weekLabel.textContent = 'Last Week';
  else if (currentWeekOffset === 1) weekLabel.textContent = 'Next Week';
  else weekLabel.textContent = `${currentWeekOffset > 0 ? '+' : ''}${currentWeekOffset} Weeks`;

  const today = new Date();
  const targetDate = new Date(today);
  targetDate.setDate(targetDate.getDate() + (currentWeekOffset * 7));
  const startOfWeek = getStartOfWeek(targetDate);

  mainContent.innerHTML = '';

  for (let i = 0; i < 7; i++) {
    const currentDay = new Date(startOfWeek);
    currentDay.setDate(currentDay.getDate() + i);
    const dateKey = formatDateKey(currentDay);
    
    const isToday = formatDateKey(today) === dateKey;

    const dayCard = document.createElement('div');
    dayCard.className = 'day-card';
    if (isToday) dayCard.style.border = '2px solid var(--primary)';
    
    const dayHeaderHtml = `
      <div class="day-header">
        <span class="day-name">${getDayName(currentDay)}${isToday ? ' (Today)' : ''}</span>
        <span class="day-date">${formatDateDisplay(currentDay)}</span>
      </div>
      <div class="slots-container">
        ${SLOTS.map(slot => renderSlot(dateKey, slot)).join('')}
      </div>
    `;
    
    dayCard.innerHTML = dayHeaderHtml;
    mainContent.appendChild(dayCard);
  }

  // Attach slot click events
  document.querySelectorAll('.btn-book-slot').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const dateKey = btn.dataset.date;
      const slotId = btn.dataset.slot;
      openBookingModal(dateKey, slotId);
    });
  });

  document.querySelectorAll('.btn-cancel-slot').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const dateKey = btn.dataset.date;
      const slotId = btn.dataset.slot;
      openCancelModal(dateKey, slotId);
    });
  });
}

function renderSlot(dateKey, slotDef) {
  const bookingId = `${dateKey}-${slotDef.id}`;
  const booking = bookings[bookingId];
  const isBooked = !!booking;
  const isBookedByMe = isBooked && booking.name.toLowerCase() === currentUser.toLowerCase();

  if (isBooked) {
    return `
      <div class="slot booked ${isBookedByMe ? 'booked-by-me' : ''}">
        <div class="slot-icon">${slotDef.icon}</div>
        <div class="slot-details">
          <div class="slot-name">${booking.name}'s Wash</div>
          <div class="slot-time">${slotDef.title} • ${slotDef.time}</div>
          ${booking.note ? `<div class="slot-note">"${booking.note}"</div>` : ''}
        </div>
        ${isBookedByMe ? `<button class="slot-action btn-cancel-slot" data-date="${dateKey}" data-slot="${slotDef.id}">Cancel</button>` : ''}
      </div>
    `;
  }

  return `
    <div class="slot available">
      <div class="slot-icon">${slotDef.icon}</div>
      <div class="slot-details">
        <div class="slot-name">Available</div>
        <div class="slot-time">${slotDef.title} • ${slotDef.time}</div>
      </div>
      <button class="slot-action btn-book-slot" data-date="${dateKey}" data-slot="${slotDef.id}">Book</button>
    </div>
  `;
}

// Interactions Modals
function openBookingModal(dateKey, slotId) {
  const dateObj = new Date(dateKey + 'T12:00:00'); 
  const slotDef = SLOTS.find(s => s.id === slotId);
  
  activeBookingId = `${dateKey}-${slotId}`;
  activeSlotInfo = { dateKey, slotId };

  modalTitle.textContent = `Book Washer`;
  modalSubtitle.textContent = `${getDayName(dateObj)} ${slotDef.title} (${slotDef.time})`;
  noteInput.value = '';
  
  modalOverlay.hidden = false;
  setTimeout(() => noteInput.focus(), 100);
}

function closeBookingModal() {
  modalOverlay.hidden = true;
  activeBookingId = null;
  activeSlotInfo = null;
}

function submitBooking() {
  const note = noteInput.value.trim();
  const bookingId = activeBookingId;

  const newBooking = {
    name: currentUser,
    note: note,
    timestamp: new Date().toISOString()
  };

  // Optimistic UI Update — close modal & re-render immediately
  bookings[bookingId] = newBooking;
  closeBookingModal();
  renderWeek();
  showToast('Booking confirmed! 🫧');

  // Persist to Firebase in the background
  set(ref(db, 'bookings/' + bookingId), newBooking).catch((error) => {
    console.error(error);
    // Rollback optimistic update
    delete bookings[bookingId];
    renderWeek();
    showToast('Failed to save booking. Check database permissions.');
  });
}

function openCancelModal(dateKey, slotId) {
  const dateObj = new Date(dateKey + 'T12:00:00');
  const slotDef = SLOTS.find(s => s.id === slotId);
  
  activeBookingId = `${dateKey}-${slotId}`;
  
  cancelSubtitle.textContent = `${getDayName(dateObj)} ${slotDef.title}`;
  cancelOverlay.hidden = false;
}

function closeCancelModal() {
  cancelOverlay.hidden = true;
  activeBookingId = null;
}

function confirmCancel() {
  const idToCancel = activeBookingId;
  const canceledBooking = bookings[idToCancel];

  // Optimistic UI Update — close modal & re-render immediately
  delete bookings[idToCancel];
  closeCancelModal();
  renderWeek();
  showToast('Booking canceled 🚿');

  // Remove from Firebase in the background
  remove(ref(db, 'bookings/' + idToCancel)).catch(e => {
    console.error(e);
    // Rollback optimistic update
    bookings[idToCancel] = canceledBooking;
    renderWeek();
    showToast('Failed to cancel. Error occurred.');
  });
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Event Listeners
function setupEventListeners() {
  loginBtn.addEventListener('click', handleLogin);
  loginNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  logoutBtn.addEventListener('click', handleLogout);

  prevWeekBtn.addEventListener('click', () => { currentWeekOffset--; renderWeek(); });
  nextWeekBtn.addEventListener('click', () => { currentWeekOffset++; renderWeek(); });

  modalClose.addEventListener('click', closeBookingModal);
  cancelBtn.addEventListener('click', closeBookingModal);
  confirmBtn.addEventListener('click', submitBooking);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeBookingModal();
  });

  cancelOverlayClose.addEventListener('click', closeCancelModal);
  keepBtn.addEventListener('click', closeCancelModal);
  confirmCancelBtn.addEventListener('click', confirmCancel);
  cancelOverlay.addEventListener('click', (e) => {
    if (e.target === cancelOverlay) closeCancelModal();
  });
}

// Kickoff
init();
