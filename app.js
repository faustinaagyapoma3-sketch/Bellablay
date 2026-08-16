import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const CATEGORY_TONES = { Fashion: 'fashion', Electronics: 'electronics', 'Home & Garden': 'home', Vehicles: 'vehicles', Furniture: 'furniture', Services: 'services', Other: 'other' };

let user = null;
let profile = null;
let listings = [];
let activeCategory = 'All';
let selectedMedia = { photos: [], video: null };
let selectedListing = null;
let currentInquiry = null;
let activeChannel = null;
let isLoginMode = false;

const byId = (id) => document.getElementById(id);
const escapeHtml = (text = '') => String(text).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const formatAge = (time) => { const minutes = Math.max(1, Math.floor((Date.now() - new Date(time).getTime()) / 60000)); return minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`; };
const setMessage = (id, message = '', isError = false) => { const element = byId(id); element.textContent = message; element.classList.toggle('error', isError); };

function openModal(id) { byId(id).hidden = false; document.body.style.overflow = 'hidden'; }
function closeModal(id) { byId(id).hidden = true; document.body.style.overflow = ''; }
function requireUser() { if (user) return true; setAuthMode(true); openModal('account-modal'); return false; }
function listingSeller(listing) { return listing.profiles?.display_name || 'BellaBlay seller'; }
function listingComments(listing) { return (listing.listing_comments || []).filter((comment) => comment.status === 'active'); }
function listingMedia(listing, kind) { return (listing.listing_media || []).filter((media) => media.kind === kind).sort((a, b) => a.position - b.position); }

async function refreshProfile() {
  if (!user) { profile = null; return; }
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  profile = data;
}

async function fetchListings() {
  const { data, error } = await supabase
    .from('listings')
    .select('*, profiles!listings_seller_id_fkey(display_name), listing_media(*), listing_comments(*, profiles!listing_comments_author_id_fkey(display_name))')
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  listings = data || [];
  renderFeed();
}

function activeListings() { return listings.filter((listing) => activeCategory === 'All' || listing.category === activeCategory); }
function listingVisual(listing) {
  const tone = CATEGORY_TONES[listing.category] || 'other';
  const photos = listingMedia(listing, 'image');
  const video = listingMedia(listing, 'video')[0];
  return `<button class="listing-visual" data-tone="${tone}" data-action="view" data-id="${listing.id}" aria-label="View ${escapeHtml(listing.title)}"><span class="listing-label">${escapeHtml(listing.category)}</span>${photos[0] ? `<img src="${photos[0].public_url}" alt="${escapeHtml(listing.title)}" />` : '<span class="visual-shape"></span><span class="visual-shadow"></span>'}<span class="media-chip">${photos.length} photo${photos.length === 1 ? '' : 's'}${video ? ' · 1 video' : ''}</span></button>`;
}

function renderFeed() {
  const visible = activeListings();
  byId('feed-count').textContent = `${visible.length} active listing${visible.length === 1 ? '' : 's'} · newest first`;
  byId('listing-feed').innerHTML = visible.map((listing) => `<article class="listing-card">${listingVisual(listing)}<div class="listing-copy"><div><p class="seller-name">By ${escapeHtml(listingSeller(listing))}</p><h3>${escapeHtml(listing.title)}</h3><p class="listing-location">${escapeHtml(listing.location)} · ${formatAge(listing.created_at)}</p></div><strong class="listing-price">${escapeHtml(listing.price)}</strong></div><div class="card-footer"><span class="comment-count">${listingComments(listing).length} comment${listingComments(listing).length === 1 ? '' : 's'}</span><button data-action="view" data-id="${listing.id}">View & comments <span>→</span></button></div></article>`).join('') || '<div class="empty-feed"><h3>No listings in this category yet.</h3><p>Be the first person to post something useful.</p></div>';
  document.querySelectorAll('#category-filters button').forEach((button) => button.classList.toggle('active', button.dataset.category === activeCategory));
}

function renderHeader() {
  const loggedIn = Boolean(user && profile);
  byId('account-button').hidden = loggedIn;
  byId('dashboard-button').hidden = !loggedIn;
  byId('dashboard-button').textContent = loggedIn ? profile.display_name : 'My account';
  byId('owner-toggle').hidden = !profile?.is_admin;
}

function setAuthMode(login) {
  isLoginMode = login;
  byId('auth-title').textContent = login ? 'Welcome back.' : 'Join the market.';
  byId('auth-copy').textContent = login ? 'Sign in to manage your listings, interested buyers, and messages.' : 'Create your account to publish listings, see buyer interest, and have private conversations.';
  byId('name-field').hidden = login;
  byId('name-field').querySelector('input').required = !login;
  byId('auth-submit').innerHTML = login ? 'Sign in <span>→</span>' : 'Create account <span>→</span>';
  byId('auth-toggle').textContent = login ? 'Need an account? Create one' : 'Already have an account? Sign in';
  byId('account-form').reset();
  setMessage('auth-message');
}

function renderMediaPreview() {
  const photoPreview = selectedMedia.photos.map((file) => `<div class="preview-chip"><img src="${file.url}" alt="Selected image preview" /><span>Photo</span></div>`).join('');
  const videoPreview = selectedMedia.video ? '<div class="preview-chip"><span>1 video</span></div>' : '';
  byId('media-preview').innerHTML = photoPreview + videoPreview;
}

function openListingForm() { if (requireUser()) { setMessage('listing-message'); openModal('listing-modal'); } }

function openDetail(id) {
  const listing = listings.find((item) => item.id === id);
  if (!listing) return;
  selectedListing = listing;
  const tone = CATEGORY_TONES[listing.category] || 'other';
  const comments = listingComments(listing).map((comment) => `<div class="comment"><b>${escapeHtml(comment.profiles?.display_name || 'Member')} · ${'★'.repeat(comment.rating)}</b><small>${formatAge(comment.created_at)}</small><p>${escapeHtml(comment.body)}</p></div>`).join('') || '<p class="no-comments">No comments yet. Be the first to ask a question.</p>';
  const photos = listingMedia(listing, 'image');
  const video = listingMedia(listing, 'video')[0];
  const isSeller = user?.id === listing.seller_id;
  byId('detail-content').innerHTML = `<div class="detail-layout"><div class="detail-media" data-tone="${tone}">${photos[0] ? `<img src="${photos[0].public_url}" alt="${escapeHtml(listing.title)}" />` : '<span class="visual-shape"></span><span class="visual-shadow"></span>'}${video ? `<a class="video-link" href="${video.public_url}" target="_blank" rel="noreferrer">Watch listing video ↗</a>` : ''}</div><div class="detail-copy"><p class="seller-name">Posted by ${escapeHtml(listingSeller(listing))} · ${formatAge(listing.created_at)}</p><h2>${escapeHtml(listing.title)}</h2><strong class="detail-price">${escapeHtml(listing.price)}</strong><p>${escapeHtml(listing.description)}</p><div class="specs"><b>Specifications</b><br />${escapeHtml(listing.specifications)}</div>${!isSeller ? `<button class="button dark full" data-action="message" data-id="${listing.id}">${user ? 'Message seller' : 'Sign in to message seller'} <span>→</span></button>` : '<p class="dashboard-note">This is your listing. Interested buyers appear in your account dashboard.</p>'}<div class="comment-section"><h3>Comments & reviews</h3><div id="comments-list">${comments}</div><form class="review-form" id="review-form"><select name="rating" aria-label="Rating"><option value="5">5★</option><option value="4">4★</option><option value="3">3★</option><option value="2">2★</option><option value="1">1★</option></select><input name="comment" required maxlength="220" placeholder="Write a respectful question or review" /><button type="submit">Post</button></form></div></div></div>`;
  openModal('detail-modal');
}

async function submitListing(event) {
  event.preventDefault();
  if (!requireUser()) return;
  const data = new FormData(event.currentTarget);
  setMessage('listing-message', 'Publishing your listing…');
  const { data: listing, error } = await supabase.from('listings').insert({ seller_id: user.id, title: data.get('title').trim(), category: data.get('category'), price: data.get('price').trim(), location: data.get('location').trim(), description: data.get('description').trim(), specifications: data.get('specifications').trim() }).select().single();
  if (error) throw error;
  const files = [...selectedMedia.photos.map((item) => ({ file: item.file, kind: 'image' })), ...(selectedMedia.video ? [{ file: selectedMedia.video.file, kind: 'video' }] : [])];
  for (let position = 0; position < files.length; position += 1) {
    const { file, kind } = files[position];
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${user.id}/${listing.id}/${Date.now()}-${position}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from('listing-media').upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const { data: publicData } = supabase.storage.from('listing-media').getPublicUrl(path);
    const { error: mediaError } = await supabase.from('listing_media').insert({ listing_id: listing.id, owner_id: user.id, kind, public_url: publicData.publicUrl, storage_path: path, position });
    if (mediaError) throw mediaError;
  }
  event.target.reset();
  selectedMedia = { photos: [], video: null };
  renderMediaPreview();
  closeModal('listing-modal');
  await fetchListings();
  openDetail(listing.id);
}

async function submitComment(event) {
  event.preventDefault();
  if (!requireUser() || !selectedListing) return;
  const data = new FormData(event.target);
  const { error } = await supabase.from('listing_comments').insert({ listing_id: selectedListing.id, author_id: user.id, rating: Number(data.get('rating')), body: data.get('comment').trim() });
  if (error) throw error;
  await fetchListings();
  openDetail(selectedListing.id);
}

async function getOrCreateInquiry(listing) {
  if (!requireUser()) return null;
  if (listing.seller_id === user.id) return null;
  const { data: existing, error: existingError } = await supabase.from('inquiries').select('*').eq('listing_id', listing.id).eq('buyer_id', user.id).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;
  const { data, error } = await supabase.from('inquiries').insert({ listing_id: listing.id, buyer_id: user.id, seller_id: listing.seller_id }).select().single();
  if (error) throw error;
  return data;
}

async function renderChat() {
  if (!currentInquiry) return;
  const { data, error } = await supabase.from('messages').select('*, profiles!messages_sender_id_fkey(display_name)').eq('inquiry_id', currentInquiry.id).order('created_at', { ascending: true });
  if (error) throw error;
  byId('chat-messages').innerHTML = (data || []).map((message) => `<article class="chat-bubble ${message.sender_id === user.id ? 'mine' : ''}"><b>${escapeHtml(message.profiles?.display_name || 'BellaBlay member')}</b><p>${escapeHtml(message.body)}</p><small>${formatAge(message.created_at)}</small></article>`).join('') || '<p class="no-comments">Start the conversation by asking about this listing.</p>';
  byId('chat-messages').scrollTop = byId('chat-messages').scrollHeight;
}

async function openChat(inquiry, listingTitle) {
  currentInquiry = inquiry;
  byId('chat-title').textContent = listingTitle || 'Private conversation';
  byId('chat-participants').textContent = 'Only the buyer, seller, and BellaBlay owner can access this conversation.';
  setMessage('chat-message');
  await renderChat();
  openModal('chat-modal');
  if (activeChannel) supabase.removeChannel(activeChannel);
  activeChannel = supabase.channel(`inquiry-${inquiry.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `inquiry_id=eq.${inquiry.id}` }, () => renderChat()).subscribe();
}

async function messageSeller(id) {
  if (!user) { setAuthMode(true); openModal('account-modal'); return; }
  const listing = listings.find((item) => item.id === id);
  if (!listing) return;
  const inquiry = await getOrCreateInquiry(listing);
  if (inquiry) await openChat(inquiry, listing.title);
}

async function submitMessage(event) {
  event.preventDefault();
  if (!currentInquiry) return;
  const data = new FormData(event.target);
  const body = data.get('message').trim();
  const { error } = await supabase.from('messages').insert({ inquiry_id: currentInquiry.id, sender_id: user.id, body });
  if (error) throw error;
  await supabase.from('inquiries').update({ last_message_at: new Date().toISOString() }).eq('id', currentInquiry.id);
  event.target.reset();
  await renderChat();
}

async function renderDashboard() {
  const [{ data: mine, error: mineError }, { data: inquiries, error: inquiryError }] = await Promise.all([
    supabase.from('listings').select('id, title, status, created_at').eq('seller_id', user.id).order('created_at', { ascending: false }),
    supabase.from('inquiries').select('id, buyer_id, seller_id, last_message_at, listings!inquiries_listing_id_fkey(title), profiles!inquiries_buyer_id_fkey(display_name)').eq('seller_id', user.id).order('last_message_at', { ascending: false })
  ]);
  if (mineError || inquiryError) throw mineError || inquiryError;
  byId('my-listings').innerHTML = (mine || []).map((listing) => `<article class="dashboard-row"><div><b>${escapeHtml(listing.title)}</b><span>${escapeHtml(listing.status)} · ${formatAge(listing.created_at)}</span></div></article>`).join('') || '<p class="dashboard-note">You have not posted a listing yet.</p>';
  byId('interest-list').innerHTML = (inquiries || []).map((inquiry) => `<article class="dashboard-row"><div><b>${escapeHtml(inquiry.profiles?.display_name || 'Interested buyer')}</b><span>${escapeHtml(inquiry.listings?.title || 'Listing')} · ${formatAge(inquiry.last_message_at)}</span></div><button class="outline-button inbox-button" data-inquiry="${inquiry.id}" data-title="${escapeHtml(inquiry.listings?.title || 'Listing')}">Open chat</button></article>`).join('') || '<p class="dashboard-note">When a buyer messages one of your listings, they will appear here.</p>';
}

async function openDashboard() { if (!requireUser()) return; await renderDashboard(); openModal('dashboard-modal'); }

async function renderOwnerPanel() {
  const { data, error } = await supabase.from('listings').select('id, title, category, status, created_at, profiles!listings_seller_id_fkey(display_name), listing_comments(id)').order('created_at', { ascending: false });
  if (error) throw error;
  byId('owner-list').innerHTML = (data || []).map((listing) => `<div class="owner-row"><div class="owner-thumb" data-tone="${CATEGORY_TONES[listing.category] || 'other'}"></div><div><h3>${escapeHtml(listing.title)}</h3><p>${escapeHtml(listing.profiles?.display_name || 'Seller')} · ${escapeHtml(listing.category)} · ${(listing.listing_comments || []).length} comments</p><p>Status: <b>${escapeHtml(listing.status)}</b></p></div><div class="owner-actions"><button data-owner="${listing.id}" data-command="${listing.status === 'active' ? 'hide' : 'approve'}">${listing.status === 'active' ? 'Hide' : 'Approve'}</button><button class="danger" data-owner="${listing.id}" data-command="remove">Remove</button></div></div>`).join('') || '<p class="dashboard-note">No listings yet.</p>';
}

async function ownerAction(id, command) {
  const changes = command === 'remove' ? { status: 'removed' } : { status: command === 'hide' ? 'hidden' : 'active' };
  const { error } = await supabase.from('listings').update(changes).eq('id', id);
  if (error) throw error;
  await Promise.all([fetchListings(), renderOwnerPanel()]);
}

async function syncSession() {
  const { data: { session } } = await supabase.auth.getSession();
  user = session?.user || null;
  await refreshProfile();
  renderHeader();
}

function handleClick(event) {
  const action = event.target.closest('[data-action]');
  if (action?.dataset.action === 'view') openDetail(action.dataset.id);
  if (action?.dataset.action === 'message') messageSeller(action.dataset.id).catch(showError);
  const owner = event.target.closest('[data-owner]');
  if (owner) ownerAction(owner.dataset.owner, owner.dataset.command).catch(showError);
  const close = event.target.closest('[data-close]');
  if (close) closeModal(close.dataset.close);
  const inquiry = event.target.closest('[data-inquiry]');
  if (inquiry) openChat({ id: inquiry.dataset.inquiry }, inquiry.dataset.title).catch(showError);
}

function showError(error) { console.error(error); const message = error?.message || 'Something went wrong. Please try again.'; alert(message); }

byId('account-button').addEventListener('click', () => { setAuthMode(true); openModal('account-modal'); });
byId('dashboard-button').addEventListener('click', () => openDashboard().catch(showError));
byId('open-post').addEventListener('click', openListingForm);
byId('hero-post').addEventListener('click', openListingForm);
byId('auth-toggle').addEventListener('click', () => setAuthMode(!isLoginMode));
byId('category-filters').addEventListener('click', (event) => { const button = event.target.closest('button[data-category]'); if (!button) return; activeCategory = button.dataset.category; renderFeed(); });
byId('listing-feed').addEventListener('click', handleClick);
byId('detail-content').addEventListener('click', handleClick);
byId('dashboard-modal').addEventListener('click', handleClick);
byId('owner-panel').addEventListener('click', handleClick);
document.addEventListener('click', handleClick);

byId('account-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  setMessage('auth-message', isLoginMode ? 'Signing in…' : 'Creating your account…');
  try {
    const result = isLoginMode
      ? await supabase.auth.signInWithPassword({ email: data.get('email').trim(), password: data.get('password') })
      : await supabase.auth.signUp({ email: data.get('email').trim(), password: data.get('password'), options: { data: { display_name: data.get('name').trim() } } });
    if (result.error) throw result.error;
    if (!isLoginMode && !result.data.session) { setMessage('auth-message', 'Check your email to confirm your account, then sign in.'); return; }
    await syncSession(); closeModal('account-modal'); await fetchListings();
  } catch (error) { setMessage('auth-message', error.message || 'Unable to complete this request.', true); }
});

byId('photos-input').addEventListener('change', (event) => { const files = [...event.target.files]; if (files.length > 3) { alert('Please select up to three photos only.'); event.target.value = ''; return; } selectedMedia.photos.forEach((file) => URL.revokeObjectURL(file.url)); selectedMedia.photos = files.map((file) => ({ file, url: URL.createObjectURL(file) })); renderMediaPreview(); });
byId('video-input').addEventListener('change', (event) => { const file = event.target.files[0]; if (file && file.size > 25 * 1024 * 1024) { alert('Please select a video smaller than 25 MB.'); event.target.value = ''; return; } selectedMedia.video = file ? { file, url: URL.createObjectURL(file) } : null; renderMediaPreview(); });
byId('listing-form').addEventListener('submit', (event) => submitListing(event).catch((error) => { setMessage('listing-message', error.message || 'Unable to publish your listing.', true); }));
byId('detail-content').addEventListener('submit', (event) => { if (event.target.id === 'review-form') submitComment(event).catch(showError); });
byId('chat-form').addEventListener('submit', (event) => submitMessage(event).catch((error) => setMessage('chat-message', error.message || 'Unable to send message.', true)));
byId('owner-toggle').addEventListener('click', () => { const panel = byId('owner-panel'); panel.hidden = false; panel.style.display = 'block'; renderOwnerPanel().catch(showError); });
byId('close-owner').addEventListener('click', () => { const panel = byId('owner-panel'); panel.hidden = true; panel.style.display = ''; });
byId('sign-out').addEventListener('click', async () => { await supabase.auth.signOut(); closeModal('dashboard-modal'); });

supabase.auth.onAuthStateChange(async (_event, session) => {
  user = session?.user || null;
  try { await refreshProfile(); renderHeader(); if (user) await fetchListings(); } catch (error) { showError(error); }
});

async function initialise() {
  try {
    await syncSession();
    await fetchListings();
  } catch (error) {
    byId('site-notice').textContent = 'BellaBlay needs its Supabase setup completed before accounts and listings can go live.';
    showError(error);
  }
}

initialise();
