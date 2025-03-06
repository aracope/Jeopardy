// Store the body element in a variable
const body = $("body");

// Number of categories for the game
const NUM_CATEGORIES = 6; 
// Number of questions per category
const NUM_QUESTIONS_PER_CAT = 5; 
// API endpoint for fetching categories and clues
const API_URL = "https://rithm-jeopardy.herokuapp.com/api/"; 
// Array to hold category data
let categories = []; 
// Array to hold extra categories for Daily Double
let extraCategories = []; 
// Total number of questions in the game
const TOTAL_QUESTIONS = NUM_CATEGORIES * NUM_QUESTIONS_PER_CAT; 
// Flag to track if the game has started
let gameStarted = false; 
// Counter to track how many questions have been answered
let answeredQuestionsCount = 0;

/** 
 * Fetch category IDs from the API to use for the game, 
 * and cache extra categories for the Daily Double.
 */
async function getCategoryIds() {
    try {
        const response = await axios.get(`${API_URL}categories`, { params: { count: 100 } });

        if (!response.data || response.data.length === 0) {
            throw new Error("No categories returned from API.");
        }

        // Shuffle the categories and select the top NUM_CATEGORIES categories for the game
        let shuffledCategories = _.shuffle(response.data);
        let selectedCategories = shuffledCategories.slice(0, NUM_CATEGORIES);

        // Cache extra categories for the Daily Double
        extraCategories = shuffledCategories.slice(NUM_CATEGORIES, NUM_CATEGORIES + 5);

        // Return the IDs of the selected categories
        return selectedCategories.map(cat => cat.id);
    } catch (error) {
        console.error("Error fetching category IDs:", error);
        return [];
    }
}

/** 
 * Fetch data for a given category ID from the API and ensure valid clues are available.
 */
async function getCategory(catId) {
    try {
        const response = await axios.get(`${API_URL}category`, { params: { id: catId } });

        if (!response.data || !response.data.clues || response.data.clues.length === 0) {
            throw new Error(`Category ${catId} has no valid clues.`);
        }

        // Shuffle the clues and pick the top NUM_QUESTIONS_PER_CAT clues for the category
        let clues = _.shuffle(response.data.clues).slice(0, NUM_QUESTIONS_PER_CAT);

        // Return the category data with clues, including a 'showing' state for toggling between question/answer
        return {
            title: response.data.title || "Unknown Category",
            clues: clues.map(clue => ({
                question: clue.question || "No question available",
                answer: clue.answer || "No answer available",
                // Initial state: neither the question nor answer is shown
                showing: null 
            }))
        };
    } catch (error) {
        console.error(`Error fetching category ${catId}:`, error);
        return {
            title: "Error",
            clues: Array(NUM_QUESTIONS_PER_CAT).fill({
                question: "Error loading question",
                answer: "Error loading answer",
                showing: null
            })
        };
    }
}

/** 
 * Populate the game board dynamically by creating the table with categories and questions.
 * This function is called after the categories and questions have been fetched.
 */
async function fillTable() {
    // Clear any existing game content
    $("#jeopardy-container").empty(); 
    const title = $("<h1>").text("Jeopardy").attr("id", "game-title");
    $("#jeopardy-container").append(title);

    const table = $("<table>", { id: "jeopardy" });

    // Create the table header with category titles
    let headerRow = $("<tr>");
    categories.forEach(cat => {
        // Add a header for each category
        headerRow.append($(`<th>${cat.title}</th>`)); 
    });

    table.append($("<thead>").append(headerRow));

    // Create the table body with placeholders for the questions
    let tbody = $("<tbody>");
    for (let i = 0; i < NUM_QUESTIONS_PER_CAT; i++) {
        let row = $("<tr>");
        for (let j = 0; j < NUM_CATEGORIES; j++) {
            let cell = $(`<td data-cat="${j}" data-clue="${i}">?</td>`);
            cell.on("click", handleClick); // Set up the click event for each cell
            row.append(cell);
        }
        tbody.append(row);
    }
    table.append(tbody);
    $("#jeopardy-container").append(table);
}

/** 
 * Show the Daily Double modal, using cached extra categories to avoid additional API calls.
 */
async function showDailyDouble() {
    try {
        // Remove any existing Daily Double modal and add an active class to the body
        $("#daily-double-modal").remove();
        body.addClass("daily-double-active");

        if (extraCategories.length === 0) {
            console.warn("No unique categories left for Daily Double!");
            return;
        }

        // Pop one category from the extraCategories list for the Daily Double
        let newCategory = extraCategories.pop();
        const clueResponse = await axios.get(`${API_URL}category`, { params: { id: newCategory.id } });

        if (!clueResponse.data || !clueResponse.data.clues || clueResponse.data.clues.length === 0) {
            throw new Error(`No clues found for Daily Double category ${newCategory.id}`);
        }

        // Pick a random clue from the selected category
        const clue = _.sample(clueResponse.data.clues);

        // Create and display the Daily Double modal
        const dailyDoubleModal = $("<div>", { id: "daily-double-modal", class: "modal-overlay" });
        const dailyDoubleModalContent = $("<div>", { class: "modal-content" });

        dailyDoubleModalContent.append($("<h2>").text("Daily Double!"));
        dailyDoubleModalContent.append($("<h3>").text(`Category: ${newCategory.title}`));
        dailyDoubleModalContent.append($("<p>").html(clue.question));

        const closeButton = $("<button>").addClass("close-btn").text("\u00d7").on("click", () => {
            dailyDoubleModal.remove();
            body.removeClass("daily-double-active");
        });

        const revealBtn = $("<button>").addClass("reveal-btn").text("Reveal Answer").on("click", () => {
            revealBtn.remove();
            dailyDoubleModalContent.append($("<p>").html(`<strong>Answer:</strong> ${clue.answer}`));

            const startNewGameBtn = $("<button>", { class: "start-btn" }).text("Start New Game?").on("click", () => {
                body.removeClass("daily-double-active");
                dailyDoubleModal.remove();
                setupAndStart();
            });

            dailyDoubleModalContent.append(startNewGameBtn);
        });

        dailyDoubleModalContent.append(closeButton, revealBtn);
        dailyDoubleModal.append(dailyDoubleModalContent);
        body.append(dailyDoubleModal);

    } catch (error) {
        console.error("Error fetching Daily Double:", error);
        alert("Oops! There was an issue loading the Daily Double. Please try again.");
    }
}

/** 
 * Handle clue clicks to toggle between question and answer. 
 * If all questions are answered, trigger the Daily Double.
 */
async function handleClick(evt) {
    let cell = $(evt.target);
    let catIdx = cell.data("cat");
    let clueIdx = cell.data("clue");

    let clue = categories[catIdx].clues[clueIdx];

    // Prevent showing the answer if it has already been revealed
    if (clue.showing === "answer") return;

    if (clue.showing === null) {
        // Display the question
        cell.html(clue.question); 
        cell.removeClass("answer-style").addClass("question-style");
        // Set the clue state to showing the question
        clue.showing = "question"; 
    } else if (clue.showing === "question") {
        // Display the answer
        cell.html(clue.answer); 
        cell.removeClass("question-style").addClass("answer-style");
        // Set the clue state to showing the answer
        clue.showing = "answer";
         // Increment the answered question count
        answeredQuestionsCount++; 
    }

    // If all questions are answered, trigger the Daily Double
    if (answeredQuestionsCount === TOTAL_QUESTIONS && gameStarted) {
        setTimeout(showDailyDouble, 500);
    }
}

/** 
 * Display a loading message while fetching data for the game.
 */
function showLoadingView() {
    $("#jeopardy-container").html("<p>Loading...</p>");
}

/** 
 * Start the game by fetching categories and rendering the table. 
 * This function is called when the game is initialized.
 */
async function setupAndStart() {
    // Reset the answered question count
    answeredQuestionsCount = 0; 
    // Mark the game as started
    gameStarted = true; 
    body.removeClass("daily-double-active");
    $(".modal-overlay").remove();

    if (!$("#jeopardy-container").length) {
        body.append('<div id="jeopardy-container"></div>');
    }
    // Show loading view while fetching data
    showLoadingView();
    // Reset categories array
    categories = [];

    try {
        // Fetch category IDs from the API
        const categoryIds = await getCategoryIds();

        if (categoryIds.length === 0) {
            throw new Error("No categories could be loaded.");
        }

        // Fetch category data for each category ID and populate the game board
        categories = await Promise.all(categoryIds.map(id => getCategory(id)));
        fillTable();
        // Create a button to restart the game
        createRestartButton();
    } catch (error) {
        console.error("Error fetching data:", error);
        $("#jeopardy-container").html("<p>Error loading game. Try again.</p>");
    }
}

/** 
 * Create a restart button to allow players to restart the game after completion. 
 */
function createRestartButton() {
    // Remove any existing restart button
    $("#restart-btn").remove();
    // Remove any active modal overlays
    $(".modal-overlay").remove();

    const restartBtn = $("<button>", { id: "restart-btn" })
        .text("Restart Game")
        .addClass("restart-btn")
        // Set the click event to restart the game
        .on("click", setupAndStart);

    // Add the restart button to the game container
    $("#jeopardy-container").append(restartBtn);
}

/** 
 * Initialize the game when the document is ready. 
 * This is where the game setup is triggered.
 */
$(document).ready(() => {
    // Start the game setup when the document is loaded
    setupAndStart();
});


