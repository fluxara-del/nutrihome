# CODEX PROJECT: NUTRIHOME

## ROLE

Act as a senior full-stack engineer, software architect, UX designer and security-focused DevOps engineer.

Build a production-quality, self-hosted private nutrition, pantry inventory and meal planning application called **NutriHome**.

This is a real personal application, not a mockup or landing page.

Implement it incrementally, with working features, database migrations, automated tests, documentation and deployment configuration.

## 1. PROJECT GOAL

Create a mobile-first Progressive Web Application (PWA) for:

- Managing household food inventory
- Tracking daily calories and macronutrients
- Maintaining a recipe database
- Generating seven-day meal plans
- Calculating shopping lists from available inventory
- Tracking body weight and nutritional progress
- Automatically preparing next week's meal plan every Sunday
- Optionally generating recipes and interpreting nutrition labels using the OpenAI API

The application will be used privately by one primary user, with the possibility of supporting family members later.

All visible interface text must be in Croatian. Use metric measurements, kilograms, grams, milliliters, euros and the Europe/Zagreb timezone.

## 2. TECHNOLOGY STACK

Preferred architecture:

- Next.js with TypeScript
- React
- Tailwind CSS
- shadcn/ui
- Prisma ORM
- SQLite database
- Docker and Docker Compose
- Responsive PWA
- Server-side scheduled jobs
- OpenAI API for optional AI features
- Tailscale for secure remote access

Use stable, maintained dependencies.

If a different technology is materially better, explain why before changing the architecture.

## 3. DEPLOYMENT ENVIRONMENT

Target server: existing home server running ZimaOS with Docker support.

Requirements:

- Deploy using Docker Compose.
- Use persistent Docker volume or bind mounts for the database and uploads.
- Support configuration through environment variables.
- Never commit secrets or API keys.
- Support application updates without losing data.
- Provide health checks.
- Provide a backup and restore procedure.
- Run database migrations safely.
- Support local network access and private remote access through Tailscale.
- Do not expose the application publicly by default.
- Configure HTTPS through a suitable Tailscale-supported approach.
- Make the PWA installable on Android and desktop.

## 4. DATABASE DESIGN

Use a normalized relational schema.

Main entities:

**FoodProduct**
- id
- name
- brand
- barcode
- category
- caloriesPer100g
- proteinPer100g
- carbsPer100g
- fatPer100g
- fiberPer100g
- defaultUnit
- createdAt
- updatedAt

**InventoryBatch**
- id
- productId
- quantity
- unit
- storageLocation
- expirationDate
- purchaseDate
- purchasePrice
- createdAt

**InventoryTransaction**
- id
- productId
- batchId
- quantityChange
- reason
- sourceReference
- timestamp

**Recipe**
- id
- title
- instructions
- servings
- preparationTime
- cookingTime
- tags
- createdAt

**RecipeIngredient**
- id
- recipeId
- productId
- quantityGrams

**MealPlan**
- id
- weekStart
- status
- targetCalories
- targetProtein

**PlannedMeal**
- id
- mealPlanId
- date
- mealType
- recipeId
- servings

**FoodLog**
- id
- date
- productId or recipeId
- quantity
- calculatedCalories
- calculatedProtein
- calculatedCarbs
- calculatedFat

**WeightLog**
- id
- date
- weightKg

**ShoppingListItem**
- id
- mealPlanId
- productId
- requiredQuantity
- availableQuantity
- missingQuantity
- purchased

**UserSettings**
- calorieTarget
- proteinTarget
- fatTarget
- carbohydrateTarget
- dietaryPreferences
- excludedIngredients
- mealCount
- weeklyBudget
- timezone

Add appropriate indexes, foreign keys, validations and migrations. Use exact decimal-safe quantity handling where appropriate.

## 5. INVENTORY MODULE

Build a complete inventory management interface.

Functions:

- Add and edit food products.
- Add inventory batches.
- Store expiration dates.
- Track food stored in refrigerator, freezer or pantry.
- Record inventory additions and removals.
- Display low-stock warnings.
- Display upcoming expiration warnings.
- Filter and search products.
- Display nutritional information.

Use a transaction history so inventory changes are auditable.

Never silently deduct ingredients merely because a recipe was planned.

Deduct inventory only when the user confirms cooking or consumption, with safeguards against double deductions.

## 6. NUTRITION TRACKING

Create a daily nutrition diary.

Features:

- Add individual foods or recipe servings.
- Calculate calories, protein, carbohydrates and fats.
- Show consumed versus target values.
- Allow editing and deleting entries.
- Record body weight.
- Display seven-day and thirty-day trends.
- Calculate rolling averages.
- Support cooked and raw food quantities.
- Mark estimated nutritional data clearly.

All nutrition calculations must work without the OpenAI API.

Do not make medical claims or automatically prescribe aggressive calorie deficits.

## 7. RECIPE DATABASE

Build recipe creation, editing and browsing.

Each recipe must include:

- Name
- Ingredients with exact quantities
- Number of servings
- Cooking instructions
- Preparation time
- Nutrition per serving
- Tags

Supported tags:

HIGH PROTEIN, MEAL PREP, WORK FRIENDLY, UNDER 20 MINUTES, FREEZER FRIENDLY, USE SOON.

Nutrition must be calculated deterministically from ingredient quantities and stored nutritional values.

## 8. WEEKLY MEAL PLANNER

Generate seven-day meal plans using:

1. User calorie targets
2. User protein targets
3. Current inventory
4. Expiration dates
5. Dietary restrictions
6. Available recipes
7. Weekly shopping budget
8. Meal-prep preferences

Prefer existing ingredients and minimize additional purchases.

Allow users to regenerate individual meals, swap recipes, adjust servings and approve the final plan.

Do not claim that nutritional targets or budget constraints are satisfied unless validated by calculations.

## 9. SHOPPING LIST

Generate shopping requirements by aggregating recipe ingredients across the approved meal plan.

Subtract usable inventory quantities.

Avoid double counting ingredients used in multiple recipes.

Group shopping items by category.

Support:

- Manual additions
- Checkboxes
- Quantity adjustments
- Purchase confirmation
- Adding purchased products to inventory

Use actual prices only when supplied or retrieved from a verified source. Otherwise clearly label prices as estimates.

## 10. SUNDAY AUTOMATION

Create a scheduled job that runs every Sunday morning in the Europe/Zagreb timezone.

It should:

1. Read the latest inventory.
2. Read current nutrition goals.
3. Generate a draft plan for the next Monday through Sunday.
4. Prioritize ingredients expiring soon.
5. Calculate nutrition.
6. Calculate missing shopping quantities.
7. Save the draft plan.
8. Make it available for user approval.

Ensure the job is idempotent and does not create duplicate weekly plans.

Never automatically deduct inventory during planning.

Provide a manual "Generate next week" button.

## 11. OPTIONAL AI FEATURES

Integrate the OpenAI API through server-side endpoints.

Features:

- Generate original recipes from available ingredients.
- Suggest ingredient substitutions.
- Interpret uploaded nutrition-label photographs.
- Suggest high-protein meals.
- Explain nutrition calculations.

AI outputs must be validated against structured schemas.

Never trust AI-generated numerical nutrition estimates over verified product data.

Show extracted label values for user confirmation before saving.

AI must not directly modify inventory or food logs without explicit confirmation.

Include API usage limits, error handling and cost controls.

## 12. UI/UX

Design a clean, modern, mobile-first interface.

Primary navigation:

- Dashboard
- Zalihe
- Dnevnik prehrane
- Recepti
- Tjedni plan
- Kupnja
- Napredak
- Postavke

Use large touch targets, readable typography and minimal friction.

The dashboard should show:

- Today's calorie and protein progress
- Today's meals
- Food expiring soon
- Next planned meals
- Shopping list status
- Recent weight trend

Support dark and light themes.

## 13. SECURITY

This application stores personal nutrition and weight data.

Requirements:

- Private network access through Tailscale.
- Authentication for application access.
- Secure session management.
- No publicly accessible database.
- Server-side validation.
- CSRF protection where applicable.
- Secure file upload handling.
- Rate limiting for sensitive endpoints.
- No secrets in frontend code.
- Safe database backups.
- No sensitive information in application logs.

Do not assume that Tailscale alone replaces application security.

## 14. TESTING

Implement tests for:

- Nutrition calculations
- Unit conversions
- Inventory transactions
- Expiration-date logic
- Recipe serving calculations
- Shopping list aggregation
- Insufficient inventory
- Duplicate transaction prevention
- Weekly schedule behavior
- Timezone and daylight-saving changes
- Authentication and authorization

Provide a smoke test for the Docker deployment.

## 15. DEVELOPMENT PROCESS

Do not attempt to implement the entire application in one unreviewable step.

Start by:

1. Inspecting the repository.
2. Creating an architecture document.
3. Creating a phased implementation plan.
4. Defining the database schema.
5. Implementing the application skeleton.
6. Implementing inventory management.
7. Adding nutrition tracking.
8. Adding recipes and meal planning.
9. Adding shopping lists and scheduled jobs.
10. Adding optional AI features.
11. Preparing production deployment.

At the end of each phase:

- Explain what was implemented.
- Run available tests.
- Identify incomplete features.
- Provide exact instructions for verification.
- Wait for approval before major architectural changes.

Never claim a feature is working unless it has been implemented and appropriately tested.

## 16. DELIVERABLES

Produce:

- Complete source code
- Dockerfile
- docker-compose.yml
- .env.example
- Database migrations
- Seed data for testing
- Automated tests
- README.md
- ZimaOS installation guide
- Tailscale remote access guide
- Backup and restore guide

Begin with architecture and Phase 1 implementation. Do not generate fake screens or pretend backend features exist.