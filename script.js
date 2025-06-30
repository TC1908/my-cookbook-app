// Global variables
let recipes = [];
let currentRecipeId = null;

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    loadRecipes();
    updateCategoryGrid();
    updateFilters();
    
    // Setup form submission
    document.getElementById('recipeForm').addEventListener('submit', handleRecipeSubmit);
    
    // Setup image preview
    document.getElementById('recipeImages').addEventListener('change', handleImagePreview);
});

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

function showAddRecipe() {
    showPage('add-recipe-page');
    updateActiveNavLink('add-link');
    resetForm();
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

// Recipe management functions
async function handleRecipeSubmit(e) {
    e.preventDefault();
    
    // Get images from the form
    const images = await getRecipeImages();
    
    const recipe = {
        id: Date.now().toString(),
        title: document.getElementById('recipeTitle').value,
        ingredients: getIngredients(),
        steps: getSteps(),
        categories: document.getElementById('recipeCategories').value.split(',').map(cat => cat.trim()).filter(cat => cat),
        cookingTime: getCookingTime(),
        comments: document.getElementById('recipeComments').value,
        images: images, // Now properly storing images
        dateCreated: new Date().toISOString()
    };
    
    recipes.push(recipe);
    saveRecipes();
    resetForm();
    showSuccessMessage('Recipe saved successfully!');
    showAllRecipes();
}

function getRecipeImages() {
    return new Promise((resolve) => {
        const fileInput = document.getElementById('recipeImages');
        const files = Array.from(fileInput.files).slice(0, 5); // Limit to 5 images
        const imageData = [];
        
        if (files.length === 0) {
            resolve([]);
            return;
        }
        
        let processedFiles = 0;
        
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = function(e) {
                imageData.push(e.target.result); // Store as base64 data URL
                processedFiles++;
                
                if (processedFiles === files.length) {
                    resolve(imageData);
                }
            };
            reader.readAsDataURL(file);
        });
    });
}

function deleteRecipe(recipeId, event) {
    event.stopPropagation(); // Prevent card click
    
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;
    
    if (confirm(`Are you sure you want to delete "${recipe.title}"? This cannot be undone.`)) {
        recipes = recipes.filter(r => r.id !== recipeId);
        saveRecipes();
        showSuccessMessage('Recipe deleted successfully!');
        
        // Update displays
        displayRecipes();
        updateCategoryGrid();
        updateFilters();
    }
}

function showSuccessMessage(message) {
    // Remove any existing messages
    const existingMessages = document.querySelectorAll('.message');
    existingMessages.forEach(msg => msg.remove());
    
    // Create new message
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message success';
    messageDiv.textContent = message;
    
    // Insert at the top of main content
    const mainContent = document.querySelector('.main-content');
    mainContent.insertBefore(messageDiv, mainContent.firstChild);
    
    // Remove after 3 seconds
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
    // Renumber steps
    document.querySelectorAll('.step-number').forEach((stepNum, index) => {
        stepNum.textContent = `${index + 1}.`;
    });
}

function handleImagePreview(e) {
    const files = Array.from(e.target.files).slice(0, 5); // Limit to 5 images
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
    document.getElementById('imagePreview').innerHTML = '';
    
    // Reset to single ingredient and step
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
    
    // Get top 6 categories
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
    
    // If no recipes, show default categories
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
    // Clear and add "All" button
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
    setTimeout(() => filterRecipes(category), 100); // Small delay to ensure page is shown
}

function filterRecipes(category) {
    // Update active filter
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Filter recipes
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
        
        // Create image display - show first image if available
        const imageHtml = recipe.images && recipe.images.length > 0 
            ? `<img src="${recipe.images[0]}" alt="${recipe.title}" style="width: 100%; height: 200px; object-fit: cover; border-radius: 10px; margin-bottom: 15px;">` 
            : '<div style="width: 100%; height: 200px; background: linear-gradient(135deg, #B8D8D8, #7A9E9F); border-radius: 10px; margin-bottom: 15px; display: flex; align-items: center; justify-content: center; color: #4F6367; font-size: 18px; font-weight: bold;">No Image</div>';
        
        recipeCard.innerHTML = `
            ${imageHtml}
            <div class="recipe-title">${recipe.title}</div>
            <div class="recipe-time">${formatCookingTime(recipe.cookingTime)}</div>
            <div class="recipe-categories">
                ${recipe.categories.map(cat => `<span class="category-tag">${cat}</span>`).join('')}
            </div>
            <div class="recipe-actions">
                <button class="view-recipe-btn" onclick="showRecipeDetail('${recipe.id}')">View Recipe</button>
                <button class="delete-recipe-btn" onclick="deleteRecipe('${recipe.id}', event)">Delete</button>
            </div>
        `;
        
        recipesGrid.appendChild(recipeCard);
    });
}

function showRecipeDetail(recipeId) {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;
    
    // Create image gallery for detail view
    const imageGalleryHtml = recipe.images && recipe.images.length > 0 
        ? `<div style="margin-bottom: 20px;">
             <div style="display: flex; gap: 10px; flex-wrap: wrap;">
               ${recipe.images.map(img => `<img src="${img}" alt="${recipe.title}" style="width: 150px; height: 150px; object-fit: cover; border-radius: 10px; border: 2px solid #B8D8D8;">`).join('')}
             </div>
           </div>`
        : '';
    
    const content = document.getElementById('recipeDetailContent');
    content.innerHTML = `
        <h1>${recipe.title}</h1>
        ${imageGalleryHtml}
        <div class="recipe-time">${formatCookingTime(recipe.cookingTime)}</div>
        <div class="recipe-categories" style="margin: 15px 0;">
            ${recipe.categories.map(cat => `<span class="category-tag">${cat}</span>`).join('')}
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
            <button class="delete-recipe-btn" onclick="deleteRecipeFromDetail('${recipe.id}')">Delete Recipe</button>
        </div>
    `;
    
    showPage('recipe-detail-page');
    // Don't update nav links for detail page
}

function deleteRecipeFromDetail(recipeId) {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;
    
    if (confirm(`Are you sure you want to delete "${recipe.title}"? This cannot be undone.`)) {
        recipes = recipes.filter(r => r.id !== recipeId);
        saveRecipes();
        showSuccessMessage('Recipe deleted successfully!');
        showAllRecipes(); // Go back to all recipes page
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
    }
}
