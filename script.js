// Global variables
let recipes = [];
let currentRecipeId = null;
let currentRecipe = null;
let mealPlans = {}; // Store meal plans by date-meal key
let currentWeekOffset = 0; // 0 = current weeks, -1 = previous, 1 = next
let selectedMealSlot = null; // For modal recipe selection
let basketItems = []; // Shopping basket items
let basketPeriod = { start: null, end: null }; // Current basket period
let githubToken = null; // GitHub access token
let gistId = null; // GitHub Gist ID for storage
let isEditing = false; // Track if we're editing a recipe
let existingImages = []; // Store existing images during edit

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    loadRecipes();
    loadMealPlans();
    loadBasket();
    loadGitHubConfig();
    updateCategoryGrid();
    updateFilters();
    initializeDateInputs();
    updateBasketCount();
    updateSyncButtons();
    
    // Setup form submission
    document.getElementById('recipeForm').addEventListener('submit', handleRecipeSubmit);
    
    // Setup image preview
    document.getElementById('recipeImages').addEventListener('change', handleImagePreview);
});

// GitHub Sync Functions
function showSyncModal() {
    const modal = document.getElementById('syncModal');
    const tokenInput = document.getElementById('githubToken');
    
    // Pre-fill token if exists
    if (githubToken) {
        tokenInput.value = githubToken;
    }
    
    updateSyncButtons();
    modal.style.display = 'block';
}

function closeSyncModal() {
    document.getElementById('syncModal').style.display = 'none';
    clearSyncStatus();
}

function saveToken() {
    const token = document.getElementById('githubToken').value.trim();
    
    if (!token) {
        showSyncStatus('Please enter your GitHub token', 'error');
        return;
    }
    
    if (!token.startsWith('ghp_')) {
        showSyncStatus('Token should start with "ghp_"', 'error');
        return;
    }
    
    githubToken = token;
    localStorage.setItem('cookbook-github-token', token);
    updateSyncButtons();
    showSyncStatus('Token saved successfully! You can now sync your data.', 'success');
}

function updateSyncButtons() {
    const hasToken = !!githubToken;
    document.getElementById('syncToBtn').disabled = !hasToken;
    document.getElementById('loadFromBtn').disabled = !hasToken;
}

async function syncToGitHub() {
    if (!githubToken) {
        showSyncStatus('Please save your GitHub token first', 'error');
        return;
    }
    
    showSyncStatus('Syncing data to GitHub...', 'loading');
    
    try {
        const data = {
            recipes: recipes,
            mealPlans: mealPlans,
            basketItems: basketItems,
            basketPeriod: basketPeriod,
            lastSync: new Date().toISOString()
        };
        
        const gistData = {
            description: "Virtual Cookbook Data",
            public: false,
            files: {
                "cookbook-data.json": {
                    content: JSON.stringify(data, null, 2)
                }
            }
        };
        
        let response;
        let url = 'https://api.github.com/gists';
        let method = 'POST';
        
        // If we have an existing gist, update it
        if (gistId) {
            url = `https://api.github.com/gists/${gistId}`;
            method = 'PATCH';
        }
        
        response = await fetch(url, {
            method: method,
            headers: {
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(gistData)
        });
        
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }
        
        const gist = await response.json();
        gistId = gist.id;
        localStorage.setItem('cookbook-gist-id', gistId);
        
        showSyncStatus(`Successfully synced ${recipes.length} recipes, ${Object.keys(mealPlans).length} meal plans, and ${basketItems.length} basket items to GitHub!`, 'success');
        
    } catch (error) {
        console.error('Sync error:', error);
        showSyncStatus(`Sync failed: ${error.message}`, 'error');
    }
}

async function loadFromGitHub() {
    if (!githubToken) {
        showSyncStatus('Please save your GitHub token first', 'error');
        return;
    }
    
    showSyncStatus('Loading data from GitHub...', 'loading');
    
    try {
        // First, try to find existing gist
        if (!gistId) {
            // Search for our gist
            const gistsResponse = await fetch('https://api.github.com/gists', {
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (!gistsResponse.ok) {
                throw new Error(`GitHub API error: ${gistsResponse.status}`);
            }
            
            const gists = await gistsResponse.json();
            const cookbookGist = gists.find(g => 
                g.description === "Virtual Cookbook Data" && 
                g.files["cookbook-data.json"]
            );
            
            if (cookbookGist) {
                gistId = cookbookGist.id;
                localStorage.setItem('cookbook-gist-id', gistId);
            } else {
                throw new Error('No cookbook data found on GitHub. Please sync from a device that has data first.');
            }
        }
        
        // Load the gist data
        const response = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: {
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }
        
        const gist = await response.json();
        const fileContent = gist.files["cookbook-data.json"]?.content;
        
        if (!fileContent) {
            throw new Error('No cookbook data found in the gist');
        }
        
        const data = JSON.parse(fileContent);
        
        // Update local data
        recipes = data.recipes || [];
        mealPlans = data.mealPlans || {};
        basketItems = data.basketItems || [];
        basketPeriod = data.basketPeriod || { start: null, end: null };
        
        // Save to local storage
        saveRecipes();
        saveMealPlans();
        saveBasket();
        
        // Update UI
        updateCategoryGrid();
        updateFilters();
        updateBasketCount();
        
        // Refresh current page
        const currentPage = document.querySelector('.page.active').id;
        if (currentPage === 'all-recipes-page') {
            displayRecipes();
        } else if (currentPage === 'schedule-page') {
            generateSchedule();
        } else if (currentPage === 'basket-page') {
            displayBasket();
        }
        
        const syncTime = data.lastSync ? new Date(data.lastSync).toLocaleString() : 'Unknown';
        showSyncStatus(`Successfully loaded ${recipes.length} recipes, ${Object.keys(mealPlans).length} meal plans, and ${basketItems.length} basket items from GitHub! (Last sync: ${syncTime})`, 'success');
        
    } catch (error) {
        console.error('Load error:', error);
        showSyncStatus(`Load failed: ${error.message}`, 'error');
    }
}

function showSyncStatus(message, type) {
    const status = document.getElementById('syncStatus');
    status.textContent = message;
    status.className = `sync-status ${type}`;
}

function clearSyncStatus() {
    const status = document.getElementById('syncStatus');
    status.textContent = '';
    status.className = 'sync-status';
}

function loadGitHubConfig() {
    githubToken = localStorage.getItem('cookbook-github-token');
    gistId = localStorage.getItem('cookbook-gist-id');
}

// Edit Recipe Functions
function editRecipe(recipeId) {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;
    
    isEditing = true;
    existingImages = recipe.images ? [...recipe.images] : [];
    
    // Update form title and button text
    document.getElementById('recipeFormTitle').textContent = 'Edit Recipe';
    document.getElementById('saveRecipeBtn').textContent = 'Update Recipe';
    document.getElementById('cancelEditBtn').style.display = 'inline-block';
    
    // Fill form with recipe data
    document.getElementById('editRecipeId').value = recipeId;
    document.getElementById('recipeTitle').value = recipe.title;
    document.getElementById('servingSize').value = recipe.servings;
    document.getElementById('recipeKcal').value = recipe.nutrition?.kcal || '';
    document.getElementById('recipeProtein').value = recipe.nutrition?.protein || '';
    document.getElementById('cookingHours').value = recipe.cookingTime?.hours || '';
    document.getElementById('cookingMinutes').value = recipe.cookingTime?.minutes || '';
    document.getElementById('recipeCategories').value = recipe.categories.join(', ');
    document.getElementById('recipeComments').value = recipe.comments || '';
    
    // Fill ingredients
    const ingredientsList = document.getElementById('ingredientsList');
    ingredientsList.innerHTML = '';
    recipe.ingredients.forEach(ingredient => {
        const row = document.createElement('div');
        row.className = 'ingredient-row';
        row.innerHTML = `
            <input type="text" placeholder="Ingredient name" class="ingredient-name" value="${ingredient.name}">
            <input type="text" placeholder="Quantity" class="ingredient-quantity" value="${ingredient.quantity}">
            <input type="text" placeholder="Unit" class="ingredient-unit" value="${ingredient.unit}">
            <button type="button" onclick="removeIngredient(this)">Remove</button>
        `;
        ingredientsList.appendChild(row);
    });
    
    // Fill steps
    const stepsList = document.getElementById('stepsList');
    stepsList.innerHTML = '';
    recipe.steps.forEach((step, index) => {
        const row = document.createElement('div');
        row.className = 'step-row';
        row.innerHTML = `
            <span class="step-number">${index + 1}.</span>
            <textarea placeholder="Describe this step..." class="step-text">${step}</textarea>
            <button type="button" onclick="removeStep(this)">Remove</button>
        `;
        stepsList.appendChild(row);
    });
    
    // Display existing images
    displayExistingImages();
    
    // Show add recipe page
    showAddRecipe();
}

function displayExistingImages() {
    const existingImagesContainer = document.getElementById('existingImages');
    existingImagesContainer.innerHTML = '';
    
    if (existingImages.length > 0) {
        existingImages.forEach((image, index) => {
            const imageDiv = document.createElement('div');
            imageDiv.className = 'existing-image';
            imageDiv.innerHTML = `
                <img src="${image}" alt="Recipe image">
                <button class="remove-existing-image" onclick="removeExistingImage(${index})">×</button>
            `;
            existingImagesContainer.appendChild(imageDiv);
        });
    }
}

function removeExistingImage(index) {
    existingImages.splice(index, 1);
    displayExistingImages();
}

function cancelEdit() {
    isEditing = false;
    existingImages = [];
    
    // Reset form
    document.getElementById('recipeFormTitle').textContent = 'Add New Recipe';
    document.getElementById('saveRecipeBtn').textContent = 'Save Recipe';
    document.getElementById('cancelEditBtn').style.display = 'none';
    document.getElementById('existingImages').innerHTML = '';
    
    resetForm();
    showAllRecipes();
}

// Initialize date inputs with current week
function initializeDateInputs() {
    const today = new Date();
    const monday = new Date(today);
    const daysSinceMonday = (today.getDay() + 6) % 7;
    monday.setDate(today.getDate() - daysSinceMonday);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    document.getElementById('basketStartDate').value = formatDateForInput(monday);
    document.getElementById('basketEndDate').value = formatDateForInput(sunday);
}

function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
}

function updateBasketEndDate() {
    const startDate = document.getElementById('basketStartDate').value;
    if (startDate) {
        const start = new Date(startDate);
        const end = new Date(start);
        end.setDate(start.getDate() + 6); // Default to 1 week
        document.getElementById('basketEndDate').value = formatDateForInput(end);
    }
}

// Navigation functions
function showHome() {
    showPage('homepage');
    updateActiveNavLink('home-link');
    updateCategoryGrid();
}

function showAllRecipes() {
    showPage('all-recipes-page');
    updateActiveNavLink('recipes-link');
    displayRecipes();
    updateFilters();
}

function showSchedule() {
    showPage('schedule-page');
    updateActiveNavLink('schedule-link');
    generateSchedule();
}

function showAddRecipe() {
    if (!isEditing) {
        // Reset form title and button text for new recipe
        document.getElementById('recipeFormTitle').textContent = 'Add New Recipe';
        document.getElementById('saveRecipeBtn').textContent = 'Save Recipe';
        document.getElementById('cancelEditBtn').style.display = 'none';
        resetForm();
    }
    showPage('add-recipe-page');
    updateActiveNavLink('add-link');
}

function showBasket() {
    showPage('basket-page');
    updateActiveNavLink('basket-link');
    displayBasket();
}

function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    // Show selected page
    document.getElementById(pageId).classList.add('active');
}

function updateActiveNavLink(activeLinkId) {
    // Remove active class from all nav links
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.remove('active');
    });
    // Add active class to current link
    document.getElementById(activeLinkId).classList.add('active');
}

// Basket functions
function addToBasket() {
    const startDate = document.getElementById('basketStartDate').value;
    const endDate = document.getElementById('basketEndDate').value;
    
    if (!startDate || !endDate) {
        alert('Please select both start and end dates.');
        return;
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) {
        alert('Start date must be before end date.');
        return;
    }
    
    // Store basket period
    basketPeriod = { 
        start: startDate, 
        end: endDate,
        startFormatted: formatDateDisplay(start),
        endFormatted: formatDateDisplay(end)
    };
    
    // Clear existing basket
    basketItems = [];
    
    // Collect ingredients from meal plans in date range
    const ingredientMap = new Map();
    
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
        const dateKey = formatDateKey(date);
        
        // Check each meal type
        ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
            const mealKey = `${dateKey}-${mealType}`;
            const mealPlan = mealPlans[mealKey];
            
            if (mealPlan) {
                const recipe = recipes.find(r => r.id === mealPlan.recipeId);
                if (recipe) {
                    recipe.ingredients.forEach(ingredient => {
                        const key = `${ingredient.name.toLowerCase()}-${ingredient.unit.toLowerCase()}`;
                        
                        if (ingredientMap.has(key)) {
                            const existing = ingredientMap.get(key);
                            const currentQuantity = parseQuantity(existing.quantity);
                            const newQuantity = parseQuantity(ingredient.quantity);
                            existing.quantity = formatQuantity(currentQuantity + newQuantity);
                            existing.sources.add(`${recipe.title} (${formatDateDisplay(date)} ${mealType})`);
                        } else {
                            ingredientMap.set(key, {
                                name: ingredient.name,
                                quantity: ingredient.quantity,
                                unit: ingredient.unit,
                                sources: new Set([`${recipe.title} (${formatDateDisplay(date)} ${mealType})`]),
                                id: Date.now() + Math.random()
                            });
                        }
                    });
                }
            }
        });
    }
    
    // Convert map to basket items
    basketItems = Array.from(ingredientMap.values()).map(item => ({
        ...item,
        sources: Array.from(item.sources)
    }));
    
    saveBasket();
    updateBasketCount();
    showSuccessMessage(`Added ${basketItems.length} items to basket for ${basketPeriod.startFormatted} - ${basketPeriod.endFormatted}`);
    showBasket();
}

function addManualItem() {
    const name = document.getElementById('manualItemName').value.trim();
    const quantity = document.getElementById('manualItemQuantity').value.trim();
    const unit = document.getElementById('manualItemUnit').value.trim();
    
    if (!name) {
        alert('Please enter an item name.');
        return;
    }
    
    const newItem = {
        id: Date.now() + Math.random(),
        name: name,
        quantity: quantity || '1',
        unit: unit || '',
        sources: ['Added manually']
    };
    
    basketItems.push(newItem);
    saveBasket();
    updateBasketCount();
    
    // Clear form
    document.getElementById('manualItemName').value = '';
    document.getElementById('manualItemQuantity').value = '';
    document.getElementById('manualItemUnit').value = '';
    
    displayBasket();
    showSuccessMessage('Item added to basket!');
}

function editBasketItem(itemId) {
    const item = basketItems.find(i => i.id === itemId);
    if (!item) return;
    
    const newQuantity = prompt('Edit quantity:', item.quantity);
    if (newQuantity !== null) {
        item.quantity = newQuantity.trim();
        saveBasket();
        displayBasket();
    }
}

function deleteBasketItem(itemId) {
    basketItems = basketItems.filter(i => i.id !== itemId);
    saveBasket();
    updateBasketCount();
    displayBasket();
}

function clearBasket() {
    if (confirm('Are you sure you want to clear the entire basket?')) {
        basketItems = [];
        basketPeriod = { start: null, end: null };
        saveBasket();
        updateBasketCount();
        displayBasket();
        showSuccessMessage('Basket cleared!');
    }
}

function displayBasket() {
    const basketItemsContainer = document.getElementById('basketItems');
    const basketPeriodInfo = document.getElementById('basketPeriodInfo');
    
    // Update period info
    if (basketPeriod.start && basketPeriod.end) {
        basketPeriodInfo.textContent = `Shopping for: ${basketPeriod.startFormatted} to ${basketPeriod.endFormatted}`;
    } else {
        basketPeriodInfo.textContent = 'No shopping period selected';
    }
    
    // Update items display
    if (basketItems.length === 0) {
        basketItemsContainer.innerHTML = `
            <div class="basket-items">
                <h3>Shopping List</h3>
                <div class="empty-basket">
                    Your basket is empty. Add recipes from the schedule or add items manually.
                </div>
            </div>
        `;
        return;
    }
    
    basketItemsContainer.innerHTML = `
        <div class="basket-items">
            <h3>Shopping List (${basketItems.length} items)</h3>
            <div class="basket-list">
                ${basketItems.map(item => `
                    <div class="basket-item">
                        <div class="basket-item-info">
                            <div class="basket-item-name">${item.name}</div>
                            <div class="basket-item-quantity">${item.quantity} ${item.unit}</div>
                            <div class="basket-item-source">From: ${item.sources.join(', ')}</div>
                        </div>
                        <div class="basket-item-actions">
                            <button class="edit-item-btn" onclick="editBasketItem(${item.id})">Edit</button>
                            <button class="delete-item-btn" onclick="deleteBasketItem(${item.id})">Delete</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function updateBasketCount() {
    document.getElementById('basketCount').textContent = basketItems.length;
}

// Schedule functions
function generateSchedule() {
    const today = new Date();
    const monday = new Date(today);
    
    // Get Monday of current week + offset
    const daysSinceMonday = (today.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0
    monday.setDate(today.getDate() - daysSinceMonday + (currentWeekOffset * 14));
    
    const scheduleBody = document.getElementById('scheduleBody');
    scheduleBody.innerHTML = '';
    
    // Generate two weeks
    for (let week = 0; week < 2; week++) {
        const row = document.createElement('tr');
        
        // Week label
        const weekCell = document.createElement('td');
        weekCell.className = 'week-header';
        weekCell.textContent = `Week ${week + 1}`;
        row.appendChild(weekCell);
        
        // Generate days for this week
        for (let day = 0; day < 7; day++) {
            const currentDate = new Date(monday);
            currentDate.setDate(monday.getDate() + (week * 7) + day);
            
            const dayCell = document.createElement('td');
            dayCell.innerHTML = generateDayCell(currentDate);
            row.appendChild(dayCell);
        }
        
        scheduleBody.appendChild(row);
    }
}

function generateDayCell(date) {
    const dateStr = formatDateKey(date);
    const dayStr = formatDateDisplay(date);
    
    return `
        <div class="day-cell">
            <div class="date-header">${dayStr}</div>
            <div class="meals-container">
                ${generateMealSlot(dateStr, 'breakfast', 'Breakfast')}
                ${generateMealSlot(dateStr, 'lunch', 'Lunch')}
                ${generateMealSlot(dateStr, 'dinner', 'Dinner')}
            </div>
        </div>
    `;
}

function generateMealSlot(dateStr, mealType, mealLabel) {
    const mealKey = `${dateStr}-${mealType}`;
    const mealPlan = mealPlans[mealKey];
    
    if (mealPlan) {
        return `
            <div class="meal-slot has-recipe" onclick="openRecipeModal('${mealKey}')">
                <div class="meal-label">${mealLabel}</div>
                <div class="meal-recipe">${mealPlan.recipeName}</div>
                <button class="remove-meal" onclick="removeMeal('${mealKey}', event)">×</button>
            </div>
        `;
    } else {
        return `
            <div class="meal-slot empty" onclick="openRecipeModal('${mealKey}')">
                <div class="meal-label">${mealLabel}</div>
                <div class="meal-recipe">Click to add</div>
            </div>
        `;
    }
}

function formatDateKey(date) {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
}

function formatDateDisplay(date) {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}`;
}

// Week navigation
function previousWeeks() {
    currentWeekOffset--;
    generateSchedule();
    updateWeekNavButtons();
}

function currentWeeks() {
    currentWeekOffset = 0;
    generateSchedule();
    updateWeekNavButtons();
}

function nextWeeks() {
    currentWeekOffset++;
    generateSchedule();
    updateWeekNavButtons();
}

function updateWeekNavButtons() {
    document.querySelectorAll('.week-nav-btn').forEach(btn => {
        btn.classList.remove('current');
    });
    
    if (currentWeekOffset === 0) {
        document.querySelector('.week-nav-btn:nth-child(2)').classList.add('current');
    }
}

// Modal functions
function openRecipeModal(mealKey) {
    selectedMealSlot = mealKey;
    populateModalRecipes();
    document.getElementById('recipeModal').style.display = 'block';
}

function closeRecipeModal() {
    document.getElementById('recipeModal').style.display = 'none';
    selectedMealSlot = null;
}

function populateModalRecipes() {
    const modalList = document.getElementById('modalRecipeList');
    modalList.innerHTML = '';
    
    if (recipes.length === 0) {
        modalList.innerHTML = '<p style="text-align: center; color: #666;">No recipes available. Add some recipes first!</p>';
        return;
    }
    
    recipes.forEach(recipe => {
        const item = document.createElement('div');
        item.className = 'modal-recipe-item';
        item.onclick = () => selectRecipe(recipe);
        
        const imageHtml = recipe.images && recipe.images.length > 0 
            ? `<img src="${recipe.images[0]}" alt="${recipe.title}">` 
            : '<div style="width: 60px; height: 60px; background: #B8D8D8; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #4F6367;">No Image</div>';
        
        const nutritionText = recipe.nutrition && (recipe.nutrition.kcal || recipe.nutrition.protein) 
            ? ` • ${recipe.nutrition.kcal ? recipe.nutrition.kcal + ' kcal' : ''}${recipe.nutrition.kcal && recipe.nutrition.protein ? ', ' : ''}${recipe.nutrition.protein ? recipe.nutrition.protein + 'g protein' : ''}`
            : '';
        
        item.innerHTML = `
            ${imageHtml}
            <div class="modal-recipe-info">
                <div class="modal-recipe-title">${recipe.title}</div>
                <div class="modal-recipe-meta">
                    ${formatCookingTime(recipe.cookingTime)} • For ${recipe.servings} people${nutritionText}
                    ${recipe.categories.length > 0 ? ' • ' + recipe.categories.slice(0, 2).join(', ') : ''}
                </div>
            </div>
        `;
        
        modalList.appendChild(item);
    });
}

function filterModalRecipes() {
    const searchTerm = document.getElementById('recipeSearch').value.toLowerCase();
    const items = document.querySelectorAll('.modal-recipe-item');
    
    items.forEach(item => {
        const title = item.querySelector('.modal-recipe-title').textContent.toLowerCase();
        const meta = item.querySelector('.modal-recipe-meta').textContent.toLowerCase();
        
        if (title.includes(searchTerm) || meta.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function selectRecipe(recipe) {
    if (!selectedMealSlot) return;
    
    mealPlans[selectedMealSlot] = {
        recipeId: recipe.id,
        recipeName: recipe.title
    };
    
    saveMealPlans();
    generateSchedule();
    closeRecipeModal();
    showSuccessMessage(`${recipe.title} added to meal plan!`);
}

function removeMeal(mealKey, event) {
    event.stopPropagation();
    delete mealPlans[mealKey];
    saveMealPlans();
    generateSchedule();
}

// Recipe management functions
async function handleRecipeSubmit(e) {
    e.preventDefault();
    
    const editingId = document.getElementById('editRecipeId').value;
    
    // Get images from the form
    const newImages = await getRecipeImages();
    // Combine existing and new images (max 5 total)
    const allImages = [...existingImages, ...newImages].slice(0, 5);
    
    const nutrition = {
        kcal: parseInt(document.getElementById('recipeKcal').value) || null,
        protein: parseFloat(document.getElementById('recipeProtein').value) || null
    };
    
    const recipe = {
        id: editingId || Date.now().toString(),
        title: document.getElementById('recipeTitle').value,
        servings: parseInt(document.getElementById('servingSize').value),
        ingredients: getIngredients(),
        steps: getSteps(),
        categories: document.getElementById('recipeCategories').value.split(',').map(cat => cat.trim()).filter(cat => cat),
        cookingTime: getCookingTime(),
        comments: document.getElementById('recipeComments').value,
        images: allImages,
        nutrition: nutrition,
        dateCreated: editingId ? recipes.find(r => r.id === editingId)?.dateCreated : new Date().toISOString(),
        dateModified: editingId ? new Date().toISOString() : undefined
    };
    
    if (editingId) {
        // Update existing recipe
        const index = recipes.findIndex(r => r.id === editingId);
        if (index !== -1) {
            recipes[index] = recipe;
        }
        showSuccessMessage('Recipe updated successfully!');
    } else {
        // Add new recipe
        recipes.push(recipe);
        showSuccessMessage('Recipe saved successfully!');
    }
    
    saveRecipes();
    
    // Reset form and editing state
    isEditing = false;
    existingImages = [];
    document.getElementById('recipeFormTitle').textContent = 'Add New Recipe';
    document.getElementById('saveRecipeBtn').textContent = 'Save Recipe';
    document.getElementById('cancelEditBtn').style.display = 'none';
    
    resetForm();
    showAllRecipes();
}

function getRecipeImages() {
    return new Promise((resolve) => {
        const fileInput = document.getElementById('recipeImages');
        const files = Array.from(fileInput.files);
        const imageData = [];
        
        if (files.length === 0) {
            resolve([]);
            return;
        }
        
        let processedFiles = 0;
        
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = function(e) {
                imageData.push(e.target.result);
                processedFiles++;
                
                if (processedFiles === files.length) {
                    resolve(imageData);
                }
            };
            reader.readAsDataURL(file);
        });
    });
}

// Ingredient scaling functions
function parseQuantity(quantityString) {
    if (!quantityString || quantityString.trim() === '') return 0;
    
    const fractionMatch = quantityString.match(/(\d+)\/(\d+)/);
    if (fractionMatch) {
        return parseFloat(fractionMatch[1]) / parseFloat(fractionMatch[2]);
    }
    
    const mixedMatch = quantityString.match(/(\d+)\s+(\d+)\/(\d+)/);
    if (mixedMatch) {
        return parseFloat(mixedMatch[1]) + (parseFloat(mixedMatch[2]) / parseFloat(mixedMatch[3]));
    }
    
    const number = parseFloat(quantityString);
    return isNaN(number) ? 0 : number;
}

function formatQuantity(quantity) {
    if (quantity === 0) return '0';
    
    if (quantity < 0.1) {
        return quantity.toPrecision(2);
    }
    
    const commonFractions = {
        0.25: '1/4',
        0.33: '1/3',
        0.5: '1/2',
        0.67: '2/3',
        0.75: '3/4'
    };
    
    const whole = Math.floor(quantity);
    const fraction = quantity - whole;
    
    for (const [decimal, frac] of Object.entries(commonFractions)) {
        if (Math.abs(fraction - parseFloat(decimal)) < 0.05) {
            return whole > 0 ? `${whole} ${frac}` : frac;
        }
    }
    
    if (Math.abs(quantity - Math.round(quantity)) < 0.1) {
        return Math.round(quantity).toString();
    }
    
    return quantity.toFixed(1);
}

function scaleIngredients(ingredients, originalServings, newServings) {
    const scaleFactor = newServings / originalServings;
    
    return ingredients.map(ingredient => {
        const originalQuantity = parseQuantity(ingredient.quantity);
        const newQuantity = originalQuantity * scaleFactor;
        
        return {
            ...ingredient,
            quantity: formatQuantity(newQuantity)
        };
    });
}

function updateServingSize() {
    const newServings = parseInt(document.getElementById('currentServings').value);
    if (!currentRecipe || newServings <= 0) return;
    
    const scaledIngredients = scaleIngredients(
        currentRecipe.ingredients,
        currentRecipe.servings,
        newServings
    );
    
    const ingredientsList = document.querySelector('#recipeDetailContent ul');
    if (ingredientsList) {
        ingredientsList.innerHTML = scaledIngredients.map(ing => 
            `<li>${ing.quantity} ${ing.unit} ${ing.name}</li>`
        ).join('');
    }
    
    // Update nutrition if available
    if (currentRecipe.nutrition && (currentRecipe.nutrition.kcal || currentRecipe.nutrition.protein)) {
        const scaleFactor = newServings / currentRecipe.servings;
        const scaledKcal = currentRecipe.nutrition.kcal ? Math.round(currentRecipe.nutrition.kcal * scaleFactor) : null;
        const scaledProtein = currentRecipe.nutrition.protein ? (currentRecipe.nutrition.protein * scaleFactor).toFixed(1) : null;
        
        const nutritionInfo = document.querySelector('.nutrition-info');
        if (nutritionInfo) {
            nutritionInfo.innerHTML = `
                ${scaledKcal ? `<div class="nutrition-item"><span class="nutrition-value">${scaledKcal}</span> kcal</div>` : ''}
                ${scaledProtein ? `<div class="nutrition-item"><span class="nutrition-value">${scaledProtein}g</span> protein</div>` : ''}
                <small>(scaled for ${newServings} people)</small>
            `;
        }
    }
}

function increaseServings() {
    const currentInput = document.getElementById('currentServings');
    const currentValue = parseInt(currentInput.value);
    currentInput.value = currentValue + 1;
    updateServingSize();
}

function decreaseServings() {
    const currentInput = document.getElementById('currentServings');
    const currentValue = parseInt(currentInput.value);
    if (currentValue > 1) {
        currentInput.value = currentValue - 1;
        updateServingSize();
    }
}

function deleteRecipe(recipeId, event) {
    event.stopPropagation();
    
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;
    
    if (confirm(`Are you sure you want to delete "${recipe.title}"? This cannot be undone.`)) {
        recipes = recipes.filter(r => r.id !== recipeId);
        saveRecipes();
        showSuccessMessage('Recipe deleted successfully!');
        
        // Remove from meal plans
        Object.keys(mealPlans).forEach(key => {
            if (mealPlans[key].recipeId === recipeId) {
                delete mealPlans[key];
            }
        });
        saveMealPlans();
        
        displayRecipes();
        updateCategoryGrid();
        updateFilters();
        if (document.getElementById('schedule-page').classList.contains('active')) {
            generateSchedule();
        }
    }
}

function showSuccessMessage(message) {
    const existingMessages = document.querySelectorAll('.message');
    existingMessages.forEach(msg => msg.remove());
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message success';
    messageDiv.textContent = message;
    
    const mainContent = document.querySelector('.main-content');
    mainContent.insertBefore(messageDiv, mainContent.firstChild);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

function getIngredients() {
    const ingredients = [];
    document.querySelectorAll('.ingredient-row').forEach(row => {
        const name = row.querySelector('.ingredient-name').value;
        const quantity = row.querySelector('.ingredient-quantity').value;
        const unit = row.querySelector('.ingredient-unit').value;
        
        if (name.trim()) {
            ingredients.push({ name, quantity, unit });
        }
    });
    return ingredients;
}

function getSteps() {
    const steps = [];
    document.querySelectorAll('.step-text').forEach(textarea => {
        if (textarea.value.trim()) {
            steps.push(textarea.value.trim());
        }
    });
    return steps;
}

function getCookingTime() {
    const hours = parseInt(document.getElementById('cookingHours').value) || 0;
    const minutes = parseInt(document.getElementById('cookingMinutes').value) || 0;
    return { hours, minutes };
}

function formatCookingTime(time) {
    if (time.hours === 0) {
        return `${time.minutes} minutes`;
    } else if (time.minutes === 0) {
        return `${time.hours} hour${time.hours > 1 ? 's' : ''}`;
    } else {
        return `${time.hours} hour${time.hours > 1 ? 's' : ''} ${time.minutes} minutes`;
    }
}

// Form manipulation functions
function addIngredient() {
    const ingredientsList = document.getElementById('ingredientsList');
    const newRow = document.createElement('div');
    newRow.className = 'ingredient-row';
    newRow.innerHTML = `
        <input type="text" placeholder="Ingredient name" class="ingredient-name">
        <input type="text" placeholder="Quantity" class="ingredient-quantity">
        <input type="text" placeholder="Unit" class="ingredient-unit">
        <button type="button" onclick="removeIngredient(this)">Remove</button>
    `;
    ingredientsList.appendChild(newRow);
}

function removeIngredient(button) {
    button.parentElement.remove();
}

function addStep() {
    const stepsList = document.getElementById('stepsList');
    const stepNumber = stepsList.children.length + 1;
    const newRow = document.createElement('div');
    newRow.className = 'step-row';
    newRow.innerHTML = `
        <span class="step-number">${stepNumber}.</span>
        <textarea placeholder="Describe this step..." class="step-text"></textarea>
        <button type="button" onclick="removeStep(this)">Remove</button>
    `;
    stepsList.appendChild(newRow);
}

function removeStep(button) {
    button.parentElement.remove();
    document.querySelectorAll('.step-number').forEach((stepNum, index) => {
        stepNum.textContent = `${index + 1}.`;
    });
}

function handleImagePreview(e) {
    const files = Array.from(e.target.files);
    const preview = document.getElementById('imagePreview');
    preview.innerHTML = '';
    
    if (files.length === 0) {
        return;
    }
    
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const imgContainer = document.createElement('div');
            imgContainer.style.position = 'relative';
            imgContainer.style.display = 'inline-block';
            
            const img = document.createElement('img');
            img.src = e.target.result;
            img.style.width = '100px';
            img.style.height = '100px';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '8px';
            img.style.border = '2px solid #B8D8D8';
            
            imgContainer.appendChild(img);
            preview.appendChild(imgContainer);
        };
        reader.readAsDataURL(file);
    });
}

function resetForm() {
    document.getElementById('recipeForm').reset();
    document.getElementById('editRecipeId').value = '';
    document.getElementById('imagePreview').innerHTML = '';
    document.getElementById('existingImages').innerHTML = '';
    document.getElementById('servingSize').value = '4';
    
    document.getElementById('ingredientsList').innerHTML = `
        <div class="ingredient-row">
            <input type="text" placeholder="Ingredient name" class="ingredient-name">
            <input type="text" placeholder="Quantity" class="ingredient-quantity">
            <input type="text" placeholder="Unit" class="ingredient-unit">
            <button type="button" onclick="removeIngredient(this)">Remove</button>
        </div>
    `;
    
    document.getElementById('stepsList').innerHTML = `
        <div class="step-row">
            <span class="step-number">1.</span>
            <textarea placeholder="Describe this step..." class="step-text"></textarea>
            <button type="button" onclick="removeStep(this)">Remove</button>
        </div>
    `;
}

// Display functions
function updateCategoryGrid() {
    const categoryCount = {};
    recipes.forEach(recipe => {
        recipe.categories.forEach(category => {
            categoryCount[category] = (categoryCount[category] || 0) + 1;
        });
    });
    
    const topCategories = Object.entries(categoryCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(entry => entry[0]);
    
    const categoryGrid = document.getElementById('categoryGrid');
    categoryGrid.innerHTML = '';
    
    topCategories.forEach(category => {
        const button = document.createElement('button');
        button.className = 'category-btn';
        button.textContent = `${category} (${categoryCount[category]})`;
        button.onclick = () => filterAndShowRecipes(category);
        categoryGrid.appendChild(button);
    });
    
    if (topCategories.length === 0) {
        const defaultCategories = ['Pasta', 'Rice', 'Potatoes', 'High-Protein', 'Quick Meals', 'Desserts'];
        defaultCategories.forEach(category => {
            const button = document.createElement('button');
            button.className = 'category-btn';
            button.textContent = category;
            button.onclick = () => filterAndShowRecipes(category.toLowerCase());
            categoryGrid.appendChild(button);
        });
    }
}

function updateFilters() {
    const categories = new Set();
    recipes.forEach(recipe => {
        recipe.categories.forEach(category => {
            categories.add(category);
        });
    });
    
    const filters = document.getElementById('filters');
    filters.innerHTML = '<button class="filter-btn active" onclick="filterRecipes(\'all\')">All</button>';
    
    Array.from(categories).sort().forEach(category => {
        const button = document.createElement('button');
        button.className = 'filter-btn';
        button.textContent = category;
        button.onclick = () => filterRecipes(category);
        filters.appendChild(button);
    });
}

function filterAndShowRecipes(category) {
    showAllRecipes();
    setTimeout(() => filterRecipes(category), 100);
}

function filterRecipes(category) {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    let filteredRecipes;
    if (category === 'all') {
        filteredRecipes = recipes;
    } else {
        filteredRecipes = recipes.filter(recipe => 
            recipe.categories.some(cat => cat.toLowerCase() === category.toLowerCase())
        );
    }
    
    displayRecipes(filteredRecipes);
}

function displayRecipes(recipesToShow = recipes) {
    const recipesGrid = document.getElementById('recipesGrid');
    recipesGrid.innerHTML = '';
    
    if (recipesToShow.length === 0) {
        recipesGrid.innerHTML = '<p style="text-align: center; font-size: 1.2em; color: #4F6367;">No recipes found. Add your first recipe!</p>';
        return;
    }
    
    recipesToShow.forEach(recipe => {
        const recipeCard = document.createElement('div');
        recipeCard.className = 'recipe-card';
        
        const imageHtml = recipe.images && recipe.images.length > 0 
            ? `<img src="${recipe.images[0]}" alt="${recipe.title}" style="width: 100%; height: 200px; object-fit: cover; border-radius: 10px; margin-bottom: 15px;">` 
            : '<div style="width: 100%; height: 200px; background: linear-gradient(135deg, #B8D8D8, #7A9E9F); border-radius: 10px; margin-bottom: 15px; display: flex; align-items: center; justify-content: center; color: #4F6367; font-size: 18px; font-weight: bold;">No Image</div>';
        
        const nutritionHtml = recipe.nutrition && (recipe.nutrition.kcal || recipe.nutrition.protein) 
            ? `<div class="recipe-nutrition">
                 ${recipe.nutrition.kcal ? `<span class="nutrition-tag">${recipe.nutrition.kcal} kcal</span>` : ''}
                 ${recipe.nutrition.protein ? `<span class="nutrition-tag">${recipe.nutrition.protein}g protein</span>` : ''}
               </div>`
            : '';
        
        recipeCard.innerHTML = `
            ${imageHtml}
            <div class="recipe-title">${recipe.title}</div>
            <div>
                <span class="recipe-time">${formatCookingTime(recipe.cookingTime)}</span>
                <span class="recipe-servings">For ${recipe.servings} people</span>
            </div>
            ${nutritionHtml}
            <div class="recipe-categories">
                ${recipe.categories.map(cat => `<span class="category-tag">${cat}</span>`).join('')}
            </div>
            <div class="recipe-actions">
                <button class="view-recipe-btn" onclick="showRecipeDetail('${recipe.id}')">View</button>
                <button class="edit-recipe-btn" onclick="editRecipe('${recipe.id}')">Edit</button>
                <button class="delete-recipe-btn" onclick="deleteRecipe('${recipe.id}', event)">Delete</button>
            </div>
        `;
        
        recipesGrid.appendChild(recipeCard);
    });
}

function showRecipeDetail(recipeId) {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;
    
    currentRecipe = recipe;
    
    const imageGalleryHtml = recipe.images && recipe.images.length > 0 
        ? `<div style="margin-bottom: 20px;">
             <div style="display: flex; gap: 10px; flex-wrap: wrap;">
               ${recipe.images.map(img => `<img src="${img}" alt="${recipe.title}" style="width: 150px; height: 150px; object-fit: cover; border-radius: 10px; border: 2px solid #B8D8D8;">`).join('')}
             </div>
           </div>`
        : '';
    
    const nutritionHtml = recipe.nutrition && (recipe.nutrition.kcal || recipe.nutrition.protein)
        ? `<div class="nutrition-info">
             ${recipe.nutrition.kcal ? `<div class="nutrition-item"><span class="nutrition-value">${recipe.nutrition.kcal}</span> kcal</div>` : ''}
             ${recipe.nutrition.protein ? `<div class="nutrition-item"><span class="nutrition-value">${recipe.nutrition.protein}g</span> protein</div>` : ''}
             <small>per serving</small>
           </div>`
        : '';
    
    const content = document.getElementById('recipeDetailContent');
    content.innerHTML = `
        <h1>${recipe.title}</h1>
        ${imageGalleryHtml}
        <div>
            <span class="recipe-time">${formatCookingTime(recipe.cookingTime)}</span>
            <span class="recipe-servings">Original: For ${recipe.servings} people</span>
        </div>
        <div class="recipe-categories" style="margin: 15px 0;">
            ${recipe.categories.map(cat => `<span class="category-tag">${cat}</span>`).join('')}
        </div>
        
        ${nutritionHtml}
        
        <div class="serving-control">
            <h3>Adjust Serving Size:</h3>
            <div class="serving-buttons">
                <button class="serving-btn" onclick="decreaseServings()">-</button>
                <div class="serving-input">
                    <input type="number" id="currentServings" value="${recipe.servings}" min="1" max="50" onchange="updateServingSize()">
                    <span>people</span>
                </div>
                <button class="serving-btn" onclick="increaseServings()">+</button>
                <span class="original-servings">(Original: ${recipe.servings} people)</span>
            </div>
        </div>
        
        <h3>Ingredients:</h3>
        <ul style="margin: 10px 0 20px 20px;">
            ${recipe.ingredients.map(ing => `<li>${ing.quantity} ${ing.unit} ${ing.name}</li>`).join('')}
        </ul>
        
        <h3>Instructions:</h3>
        <ol style="margin: 10px 0 20px 20px;">
            ${recipe.steps.map(step => `<li style="margin-bottom: 10px;">${step}</li>`).join('')}
        </ol>
        
        ${recipe.comments ? `<h3>Notes & Comments:</h3><p style="background: #EEF5DB; padding: 15px; border-radius: 8px; margin: 10px 0; border: 2px solid #B8D8D8;">${recipe.comments}</p>` : ''}
        
        <div style="margin-top: 30px;">
            <button class="edit-recipe-btn" onclick="editRecipe('${recipe.id}')" style="margin-right: 10px;">Edit Recipe</button>
            <button class="delete-recipe-btn" onclick="deleteRecipeFromDetail('${recipe.id}')">Delete Recipe</button>
        </div>
    `;
    
    showPage('recipe-detail-page');
}

function deleteRecipeFromDetail(recipeId) {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;
    
    if (confirm(`Are you sure you want to delete "${recipe.title}"? This cannot be undone.`)) {
        recipes = recipes.filter(r => r.id !== recipeId);
        saveRecipes();
        
        // Remove from meal plans
        Object.keys(mealPlans).forEach(key => {
            if (mealPlans[key].recipeId === recipeId) {
                delete mealPlans[key];
            }
        });
        saveMealPlans();
        
        showSuccessMessage('Recipe deleted successfully!');
        showAllRecipes();
        updateCategoryGrid();
        updateFilters();
    }
}

function goBack() {
    showAllRecipes();
}

// Storage functions
function saveRecipes() {
    localStorage.setItem('cookbook-recipes', JSON.stringify(recipes));
}

function loadRecipes() {
    const stored = localStorage.getItem('cookbook-recipes');
    if (stored) {
        recipes = JSON.parse(stored);
        recipes.forEach(recipe => {
            if (!recipe.servings) {
                recipe.servings = 4;
            }
            // Initialize nutrition if not present
            if (!recipe.nutrition) {
                recipe.nutrition = { kcal: null, protein: null };
            }
        });
        saveRecipes();
    }
}

function saveMealPlans() {
    localStorage.setItem('cookbook-meal-plans', JSON.stringify(mealPlans));
}

function loadMealPlans() {
    const stored = localStorage.getItem('cookbook-meal-plans');
    if (stored) {
        mealPlans = JSON.parse(stored);
    }
}

function saveBasket() {
    localStorage.setItem('cookbook-basket', JSON.stringify({ 
        items: basketItems, 
        period: basketPeriod 
    }));
}

function loadBasket() {
    const stored = localStorage.getItem('cookbook-basket');
    if (stored) {
        const basket = JSON.parse(stored);
        basketItems = basket.items || [];
        basketPeriod = basket.period || { start: null, end: null };
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const recipeModal = document.getElementById('recipeModal');
    const syncModal = document.getElementById('syncModal');
    
    if (event.target === recipeModal) {
        closeRecipeModal();
    } else if (event.target === syncModal) {
        closeSyncModal();
    }
}
