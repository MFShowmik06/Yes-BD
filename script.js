document.addEventListener('DOMContentLoaded', () => {
  const navLinks = document.querySelectorAll('aside nav a');
  const dashboardSections = document.querySelectorAll('.dashboard-content');
  const notificationBell = document.getElementById('notification-bell');
  const notificationDropdown = document.getElementById('notification-dropdown');
  const markAllReadBtn = document.getElementById('mark-all-read');
  const notificationCount = document.getElementById('notification-count');
  const dashboardTitle = document.getElementById('dashboard-title');

  // Global variable for current user ID
  let currentUserId = null;

  // Dashboard Summary Elements
  const upcomingBookingsCard = document.querySelector('#dashboard-section .bg-white:nth-child(1) p');
  const unreadMessagesCard = document.querySelector('#dashboard-section .bg-white:nth-child(2) p');
  const savedPropertiesCard = document.querySelector('#dashboard-section .bg-white:nth-child(3) p');

  // Profile Elements
  const profileForm = document.querySelector('#profile-settings-section form:nth-of-type(1)');
  const profileNameInput = document.getElementById('profile-name');
  const profileEmailInput = document.getElementById('profile-email');
  const profilePhoneInput = document.getElementById('profile-phone');
  const changePasswordForm = document.querySelector('#profile-settings-section form:nth-of-type(2)');
  const currentPasswordInput = document.getElementById('current-password');
  const newPasswordInput = document.getElementById('new-password');
  const confirmNewPasswordInput = document.getElementById('confirm-password');
  const switchToSellerBtn = document.querySelector('#profile-settings-section .bg-purple-600');


  // Bookings Elements
  const upcomingBookingsTableBody = document.querySelector('#my-bookings-section .bg-white:nth-child(2) tbody');
  const pastBookingsTableBody = document.querySelector('#my-bookings-section .bg-white:nth-child(3) tbody');

  // Messages Elements
  const messagesInboxList = document.getElementById('messages-inbox-list');
  const chatThreadView = document.getElementById('chat-thread-view');
  const messageInput = document.getElementById('message-input');
  const sendMessageBtn = document.getElementById('send-message-btn');
  let selectedReceiverId = null; // To store the ID of the selected conversation partner

  // Saved Properties Elements
  const savedPropertiesList = document.getElementById('saved-properties-list');

  // Property Search Elements
  const propertySearchForm = document.querySelector('#property-search-section .bg-white:nth-child(2) .grid');
  const searchLocationInput = document.querySelector('#property-search-section input[placeholder="Location"]');
  const searchMinPriceInput = document.querySelector('#property-search-section input[placeholder="Min Price"]');
  const searchMaxPriceInput = document.querySelector('#property-search-section input[placeholder="Max Price"]');
  const searchPropertyTypeSelect = document.querySelector('#property-search-section select');
  const recommendedPropertiesDiv = document.getElementById('recommended-properties');
  const recentlyViewedPropertiesDiv = document.getElementById('recently-viewed-properties');


  // --- Helper Functions ---

  async function fetchData(url, method = 'GET', body = null) {
    try {
      const options = { method };
      if (body) {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify(body);
      }
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, message: errorText || `HTTP error! status: ${response.status}` };
      }
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error('Fetch error:', error);
      return { success: false, message: `Network error: ${error.message}` };
    }
  }

  // --- Data Fetching and Rendering Functions ---

  async function fetchCurrentUser() {
    const response = await fetchData('/api/current-user');
    if (response.success) {
      currentUserId = response.data.id;
      // You can also use response.data.user_type here if needed for UI changes
    } else {
      // Handle case where user is not logged in or session expired
      console.error('Failed to fetch current user:', response.message);
      window.location.href = '/login.html';
    }
  }

  async function fetchDashboardSummary() {
    const response = await fetchData('/api/buyer/dashboard-summary');
    if (response.success) {
      const data = response.data;
      upcomingBookingsCard.textContent = data.upcomingBookings;
      unreadMessagesCard.textContent = data.unreadMessages;
      savedPropertiesCard.textContent = data.savedProperties;
    } else {
      console.error('Failed to fetch dashboard summary:', response.message);
    }
  }

  async function fetchProfileData() {
    const response = await fetchData('/api/buyer/profile');
    if (response.success) {
      const data = response.data;
      profileNameInput.value = `${data.first_name || ''} ${data.last_name || ''}`.trim();
      profileEmailInput.value = data.email || '';
      profilePhoneInput.value = data.phone_number || '';
    } else {
      console.error('Failed to fetch profile data:', response.message);
    }
  }

  async function updateProfile(e) {
    e.preventDefault();
    const fullName = profileNameInput.value.trim();
    const nameParts = fullName.split(' ');
    const first_name = nameParts[0] || '';
    const last_name = nameParts.slice(1).join(' ') || '';

    const updatedData = {
      username: fullName, // Assuming username is full name for simplicity
      email: profileEmailInput.value,
      first_name: first_name,
      last_name: last_name,
      phone_number: profilePhoneInput.value
    };
    const response = await fetchData('/api/buyer/profile', 'PUT', updatedData);
    if (response.success) {
      alert('Profile updated successfully!');
    } else {
      alert(`Failed to update profile: ${response.message}`);
      console.error('Failed to update profile:', response.message);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmNewPasswordInput.value;

    if (newPassword !== confirmPassword) {
      alert('New password and confirm password do not match.');
      return;
    }

    const response = await fetchData('/api/buyer/change-password', 'PUT', { current_password: currentPassword, new_password: newPassword });
    if (response.success) {
      alert('Password changed successfully!');
      changePasswordForm.reset();
    } else {
      alert(`Failed to change password: ${response.message}`);
      console.error('Failed to change password:', response.message);
    }
  }

  async function fetchBookings() {
    const upcomingResponse = await fetchData('/api/buyer/bookings/upcoming');
    const pastResponse = await fetchData('/api/buyer/bookings/past');

    if (upcomingResponse.success) {
      const upcoming = upcomingResponse.data;
      let upcomingHtml = '';
      if (upcoming.length === 0) {
        upcomingHtml = '<tr><td colspan="6" class="py-2 px-4 text-center text-gray-500">No upcoming bookings.</td></tr>';
      } else {
        upcoming.forEach(booking => {
          upcomingHtml += `
          <tr>
            <td class="py-2 px-4 border-b">${booking.property_title}</td>
            <td class="py-2 px-4 border-b">${new Date(booking.booking_date).toLocaleString()}</td>
            <td class="py-2 px-4 border-b">${booking.location}</td>
            <td class="py-2 px-4 border-b">${booking.seller_email || 'N/A'}</td>
            <td class="py-2 px-4 border-b text-yellow-600">${booking.status}</td>
            <td class="py-2 px-4 border-b">
              <button class="text-blue-600 hover:underline mr-2">Reschedule</button>
              <button class="text-red-600 hover:underline">Cancel</button>
            </td>
          </tr>
        `;
      });
      }
      upcomingBookingsTableBody.innerHTML = upcomingHtml;
    } else {
      console.error('Failed to fetch upcoming bookings:', upcomingResponse.message);
      upcomingBookingsTableBody.innerHTML = '<tr><td colspan="6" class="py-2 px-4 text-center text-red-500">Failed to load upcoming bookings.</td></tr>';
    }

    if (pastResponse.success) {
      const past = pastResponse.data;
      let pastHtml = '';
      if (past.length === 0) {
        pastHtml = '<tr><td colspan="5" class="py-2 px-4 text-center text-gray-500">No past bookings.</td></tr>';
      } else {
        past.forEach(booking => {
          pastHtml += `
          <tr>
            <td class="py-2 px-4 border-b">${booking.property_title}</td>
            <td class="py-2 px-4 border-b">${new Date(booking.booking_date).toLocaleString()}</td>
            <d class="py-2 px-4 border-b">${booking.location}</td>
            <td class="py-2 px-4 border-b text-green-600">${booking.status}</td>
            <td class="py-2 px-4 border-b">
              <button class="text-purple-600 hover:underline">Leave Review</button>
            </td>
          </tr>
        `;
      });
      }
      pastBookingsTableBody.innerHTML = pastHtml;
    } else {
      console.error('Failed to fetch past bookings:', pastResponse.message);
      pastBookingsTableBody.innerHTML = '<tr><td colspan="5" class="py-2 px-4 text-center text-red-500">Failed to load past bookings.</td></tr>';
    }
  }

  async function fetchMessages() {
    if (!currentUserId) {
      console.error('currentUserId is not set. Cannot fetch messages.');
      return;
    }
    const response = await fetchData('/api/buyer/messages');
    if (response.success) {
      const messages = response.data;
      let messagesHtml = '';
      const conversations = {};

      messages.forEach(msg => {
        const partnerId = msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id;
        const partnerUsername = msg.sender_id === currentUserId ? msg.receiver_username : msg.sender_username;

        if (!conversations[partnerId]) {
          conversations[partnerId] = {
            partnerName: partnerUsername,
            unreadCount: 0,
            lastMessage: msg.message,
            messages: [],
            partnerId: partnerId // Store partner ID for later use
          };
        }
        if (msg.receiver_id === currentUserId && !msg.is_read) {
          conversations[partnerId].unreadCount++;
        }
        conversations[partnerId].messages.push(msg);
      });

      if (Object.keys(conversations).length === 0) {
        messagesHtml = '<li class="py-2 px-4 text-center text-gray-500">No messages yet.</li>';
      } else {
        for (const partnerId in conversations) {
          const convo = conversations[partnerId];
          const unreadSpan = convo.unreadCount > 0 ? `<span class="text-xs bg-red-500 text-white px-2 py-1 rounded-full ml-2">${convo.unreadCount} New</span>` : '';
          messagesHtml += `
            <li class="flex items-center p-3 rounded-lg hover:bg-gray-100 cursor-pointer" data-partner-id="${convo.partnerId}">
              <div class="flex-grow">
                <p class="font-semibold">${convo.partnerName} ${unreadSpan}</p>
                <p class="text-sm text-gray-600 truncate">${convo.lastMessage}</p>
              </div>
            </li>
          `;
        }
      }
      messagesInboxList.innerHTML = messagesHtml;

      // Event listener for inbox items to load chat thread
      messagesInboxList.querySelectorAll('li').forEach(item => {
        item.addEventListener('click', (e) => {
          const partnerId = e.currentTarget.dataset.partnerId;
          selectedReceiverId = partnerId; // Set the receiver for sending messages
          const convo = conversations[partnerId];
          displayChatThread(convo.messages, convo.partnerName);
        });
      });

      // Display the first conversation by default if available
      const firstPartnerId = Object.keys(conversations)[0];
      if (firstPartnerId) {
        const firstConvo = conversations[firstPartnerId];
        selectedReceiverId = firstPartnerId;
        displayChatThread(firstConvo.messages, firstConvo.partnerName);
      } else {
        chatThreadView.innerHTML = '<p class="text-gray-500">Select a conversation from the inbox.</p>';
      }
    } else {
      console.error('Failed to fetch messages:', response.message);
      messagesInboxList.innerHTML = '<li class="py-2 px-4 text-center text-red-500">Failed to load messages.</li>';
    }
  }

  function displayChatThread(messages, partnerName) {
    chatThreadView.innerHTML = '';
    const chatHeader = document.querySelector('#messages-section .flex-1 h3');
    chatHeader.textContent = `Chat with ${partnerName}`;

    messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); // Sort by time

    messages.forEach(msg => {
      const isSender = msg.sender_id === currentUserId;
      const alignmentClass = isSender ? 'justify-end' : 'justify-start';
      const bgColorClass = isSender ? 'bg-green-200' : 'bg-gray-200';

      const messageBubble = `
        <div class="flex ${alignmentClass} mb-2">
          <div class="${bgColorClass} p-3 rounded-lg max-w-xs">
            <p class="text-sm">${msg.message}</p>
            <span class="text-xs text-gray-500">${new Date(msg.created_at).toLocaleTimeString()}</span>
          </div>
        </div>
      `;
      chatThreadView.innerHTML += messageBubble;
    });
    chatThreadView.scrollTop = chatThreadView.scrollHeight; // Scroll to bottom
  }

  async function sendMessage(e) {
    e.preventDefault();
    const messageContent = messageInput.value.trim();
    const propertyId = null; // For now, messages are not tied to a specific property from this UI

    if (!messageContent) {
      alert('Please enter a message.');
      return;
    }
    if (!selectedReceiverId) {
      alert('Please select a recipient from the inbox.');
      return;
    }

    const response = await fetchData('/api/buyer/messages', 'POST', {
      receiver_id: selectedReceiverId,
      property_id: propertyId,
      message: messageContent
    });

    if (response.success) {
      messageInput.value = '';
      // Re-fetch messages to update the view and display the new message
      fetchMessages();
    } else {
      alert(`Failed to send message: ${response.message}`);
      console.error('Failed to send message:', response.message);
    }
  }

  async function fetchSavedProperties() {
    const response = await fetchData('/api/buyer/saved-properties');
    if (response.success) {
      const saved = response.data;
      let savedPropertiesHtml = '';
      if (saved.length === 0) {
        savedPropertiesHtml = '<p class="text-gray-700 col-span-full">No properties saved yet.</p>';
      } else {
        saved.forEach(property => {
          savedPropertiesHtml += `
          <div class="bg-white p-4 rounded-lg shadow-md">
            <h3 class="text-lg font-bold">${property.title}</h3>
            <p class="text-sm text-gray-600">${property.location}</p>
            <p class="text-lg font-bold text-green-700 mt-2">৳ ${property.price}</p>
            <div class="mt-4 flex space-x-2">
              <button class="bg-red-500 text-white px-3 py-1 rounded-md text-sm hover:bg-red-600" data-property-id="${property.id}">Remove</button>
              <a href="/property-details.html?id=${property.id}" class="bg-blue-500 text-white px-3 py-1 rounded-md text-sm hover:bg-blue-600">View Details</a>
            </div>
          </div>
        `;
      });
      }
      savedPropertiesList.innerHTML = savedPropertiesHtml;

      // Add event listeners to remove buttons
      savedPropertiesList.querySelectorAll('button[data-property-id]').forEach(button => {
        button.addEventListener('click', async (e) => {
          const propertyId = e.target.dataset.propertyId;
          const deleteResponse = await fetchData(`/api/buyer/saved-properties/${propertyId}`, 'DELETE');
          if (deleteResponse.success) {
            alert('Property removed from saved list.');
            fetchSavedProperties(); // Refresh the list
          } else {
            alert(`Failed to remove property: ${deleteResponse.message}`);
            console.error('Failed to remove property:', deleteResponse.message);
          }
        });
      });
    } else {
      console.error('Failed to fetch saved properties:', response.message);
      savedPropertiesList.innerHTML = '<p class="text-red-500 col-span-full">Failed to load saved properties.</p>';
    }
  }

  async function searchProperties(e) {
    e.preventDefault();
    const location = searchLocationInput.value;
    const minPrice = searchMinPriceInput.value;
    const maxPrice = searchMaxPriceInput.value;
    const propertyType = searchPropertyTypeSelect.value;

    const queryParams = new URLSearchParams();
    if (location) queryParams.append('location', location);
    if (minPrice) queryParams.append('min_price', minPrice);
    if (maxPrice) queryParams.append('max_price', maxPrice);
    if (propertyType) queryParams.append('property_type', propertyType);

    const response = await fetchData(`/api/properties/filter?${queryParams.toString()}`);
    if (response.success) {
      const data = response.data;
      let propertiesHtml = '';
      if (data.length === 0) {
        propertiesHtml = '<p class="text-gray-700 col-span-full">No properties found matching your criteria.</p>';
      } else {
        data.forEach(property => {
          const imageUrl = property.images ? property.images.split(',')[0] : 'https://via.placeholder.com/400x250';
          propertiesHtml += `
          <div class="bg-gray-50 p-4 rounded-lg shadow">
            <img src="${imageUrl}" alt="Property Image" class="w-full h-32 object-cover mb-2 rounded">
            <h4 class="font-semibold">${property.title}</h4>
            <p class="text-sm text-gray-600">${property.location}</p>
            <p class="text-lg font-bold text-green-700 mt-2">৳ ${property.price}</p>
            <button class="mt-2 bg-blue-500 text-white px-3 py-1 rounded-md text-sm hover:bg-blue-600" data-property-id="${property.id}">Save</button>
            <a href="/property-details.html?id=${property.id}" class="mt-2 ml-2 text-blue-500 hover:underline text-sm">Details</a>
          </div>
        `;
      });
      }
      recommendedPropertiesDiv.innerHTML = propertiesHtml;

      // Add event listeners to save buttons
      recommendedPropertiesDiv.querySelectorAll('button[data-property-id]').forEach(button => {
        button.addEventListener('click', async (e) => {
          const propertyId = e.target.dataset.propertyId;
          const saveResponse = await fetchData('/api/buyer/saved-properties', 'POST', { property_id: propertyId });
          if (saveResponse.success) {
            alert('Property saved!');
            fetchSavedProperties(); // Refresh saved properties list
          } else {
            alert(`Failed to save property: ${saveResponse.message}`);
            console.error('Failed to save property:', saveResponse.message);
          }
        });
      });
    } else {
      console.error('Failed to search properties:', response.message);
      recommendedPropertiesDiv.innerHTML = '<p class="text-red-500 col-span-full">Failed to load properties.</p>';
    }
  }

  async function switchToSeller() {
    const confirmation = confirm('Are you sure you want to switch to a Seller account? You will be redirected to the Seller Dashboard.');
    if (confirmation) {
      const response = await fetchData('/api/buyer/switch-to-seller', 'POST');
      if (response.success) {
        alert('Successfully switched to Seller account!');
        window.location.href = '/dashboard'; // Server will redirect to seller.html
      } else {
        alert(`Failed to switch to Seller account: ${response.message}`);
        console.error('Failed to switch to Seller account:', response.message);
      }
    }
  }


  // --- Event Listeners and Initial Load ---

  // Function to show a specific section and update active link
  const showSection = (sectionId) => {
    dashboardSections.forEach(section => {
      section.classList.add('hidden');
      section.classList.remove('active');
    });
    document.getElementById(`${sectionId}-section`).classList.remove('hidden');
    document.getElementById(`${sectionId}-section`).classList.add('active');

    navLinks.forEach(link => {
      link.classList.remove('active-link');
    });
    const activeLinkElement = document.querySelector(`[data-section="${sectionId}"]`);
    if (activeLinkElement) {
      activeLinkElement.classList.add('active-link');
    }


    // Update dashboard title
    const sectionName = activeLinkElement ? activeLinkElement.querySelector('span').textContent : 'Dashboard';
    dashboardTitle.textContent = `Buyer Dashboard - ${sectionName}`;

    // Fetch data based on section
    switch (sectionId) {
      case 'dashboard':
        fetchDashboardSummary();
        break;
      case 'property-search':
        // Optionally fetch initial recommendations or recently viewed
        // For now, searchProperties will be triggered by form submission
        break;
      case 'my-bookings':
        fetchBookings();
        break;
      case 'messages':
        fetchMessages();
        break;
      case 'saved-properties':
        fetchSavedProperties();
        break;
      case 'profile-settings':
        fetchProfileData();
        break;
    }
  };

  // Handle navigation clicks
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      // Prevent default only if it's a data-section link
      if (link.dataset.section) {
        e.preventDefault();
        const section = link.dataset.section;
        showSection(section);
      }
    });
  });

  // Initial load: fetch current user and then show dashboard section
  fetchCurrentUser().then(() => {
    showSection('dashboard');
  });


  // Toggle notification dropdown
  notificationBell.addEventListener('click', () => {
    notificationDropdown.classList.toggle('hidden');
  });

  // Close dropdown if clicked outside
  window.addEventListener('click', (e) => {
    if (!notificationBell.contains(e.target) && !notificationDropdown.contains(e.target)) {
      notificationDropdown.classList.add('hidden');
    }
  });

  // Mark all notifications as read
  markAllReadBtn.addEventListener('click', () => {
    alert('All notifications marked as read!'); // Placeholder for actual logic
    notificationCount.textContent = '0';
    notificationDropdown.classList.add('hidden');
  });

  // Profile form submissions
  profileForm.addEventListener('submit', updateProfile);
  changePasswordForm.addEventListener('submit', changePassword);

  // Message send button
  sendMessageBtn.addEventListener('click', sendMessage);

  // Property search form submission
  propertySearchForm.addEventListener('submit', searchProperties);

  // Switch to Seller button
  switchToSellerBtn.addEventListener('click', switchToSeller);

});