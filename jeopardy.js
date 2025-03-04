const NUM_CATEGORIES = 6;
const NUM_QUESTIONS_PER_CAT = 5;
const API_URL = "https://rithm-jeopardy.herokuapp.com/api/";
let categories = [];
const TOTAL_QUESTIONS = NUM_CATEGORIES * NUM_QUESTIONS_PER_CAT;
let gameStarted = false;
let answeredCount = 0;

/** Get NUM_CATEGORIES random category from API. */
async function getCategoryIds() {
    const response = await axios.get(`${API_URL}categories`, { params: { count: 100 } });
    return _.shuffle(response.data).slice(0, NUM_CATEGORIES).map(cat => cat.id);
}

/** Get category data for given ID */
async function getCategory(catId) {
    const response = await axios.get(`${API_URL}category`, { params: { id: catId } });

    let clues = _.shuffle(response.data.clues || []).slice(0, NUM_QUESTIONS_PER_CAT);


    return {
        title: response.data.title,
        clues: clues.map(clue => ({ question: clue.question, answer: clue.answer, showing: null }))
    };
}

/** Fill the HTML table dynamically with the categories & questions */
async function fillTable() {
    $("#jeopardy-container").empty();
    const title = $("<h1>").text("Jeopardy").attr("id", "game-title");
    $("#jeopardy-container").append(title);

    const table = $("<table>", { id: "jeopardy" });

    let headerRow = $("<tr>");
    categories.forEach(cat => {
        headerRow.append($(`<th>${cat.title}</th>`));  // No escaping
    });

    table.append($("<thead>").append(headerRow));

    let tbody = $("<tbody>");
    for (let i = 0; i < NUM_QUESTIONS_PER_CAT; i++) {
        let row = $("<tr>");
        for (let j = 0; j < NUM_CATEGORIES; j++) {
            let cell = $(`<td data-cat="${j}" data-clue="${i}">?</td>`);
            cell.on("click", handleClick);
            row.append(cell);
        }
        tbody.append(row);
    }
    table.append(tbody);
    $("#jeopardy-container").append(table);
}

/** Handle clue clicks to reveal questions/answers */
async function handleClick(evt) {
    let cell = $(evt.target);
    let catIdx = cell.data("cat");
    let clueIdx = cell.data("clue");

    let clue = categories[catIdx].clues[clueIdx];

    if (clue.showing === "answer") return;

    if (clue.showing === null) {
        cell.html(clue.question);
        cell.removeClass("answer-style").addClass("question-style");
        clue.showing = "question";
    } else if (clue.showing === "question") {
        cell.html(clue.answer);
        cell.removeClass("question-style").addClass("answer-style");
        clue.showing = "answer";
        answeredCount++;
    }

    if (answeredCount === TOTAL_QUESTIONS && gameStarted) {
        // Add a 1-second delay before showing the Daily Double
        setTimeout(showDailyDouble, 500);
    }
}

/** Show Daily Double modal */
async function showDailyDouble() {
    try {
        $("#daily-double-modal").remove();
        $("body").addClass("daily-double-active");

        let existingCategoryIds = categories.map(cat => cat.id); // Get IDs of current board categories
        let availableCategories;

        // Fetch all 14 categories again
        const response = await axios.get(`${API_URL}categories`, { params: { count: 14 } });
        availableCategories = response.data.filter(cat => !existingCategoryIds.includes(cat.id)); // Remove already used ones

        if (availableCategories.length === 0) {
            console.warn("No unique categories left for Daily Double!");
            return;
        }

        // Pick a random category from remaining ones
        let newCategory = _.sample(availableCategories);

        // Fetch a clue from the new category
        const clueResponse = await axios.get(`${API_URL}category`, { params: { id: newCategory.id } });
        const clue = _.sample(clueResponse.data.clues); // Random clue from category

        // Create Daily Double modal
        const dailyDoubleModal = $("<div>", { id: "daily-double-modal", class: "modal-overlay" });
        const dailyDoubleModalContent = $("<div>", { class: "modal-content" });

        dailyDoubleModalContent.append($("<h2>").text("Daily Double!"));
        dailyDoubleModalContent.append($("<h3>").text(`Category: ${newCategory.title}`));
        dailyDoubleModalContent.append($("<p>").html(clue.question));

        const revealBtn = $("<button>").addClass("reveal-btn").text("Reveal Answer").on("click", () => {
            revealBtn.remove();
            dailyDoubleModalContent.append($("<p>").html(`<strong>Answer:</strong> ${clue.answer}`));

            // Add "Start New Game" button after revealing the answer
            const startNewGameBtn = $("<button>", { class: "start-btn" }).text("Start New Game?").on("click", () => {
                $("body").removeClass("daily-double-active");
                dailyDoubleModal.remove();
                setupAndStart();
            });

            dailyDoubleModalContent.append(startNewGameBtn);
        });

        dailyDoubleModalContent.append(revealBtn);
        dailyDoubleModal.append(dailyDoubleModalContent);
        $("body").append(dailyDoubleModal);

        // Remove modal on click outside
        dailyDoubleModal.on("click", (e) => {
            if ($(e.target).is(dailyDoubleModal)) dailyDoubleModal.remove();
        });

    } catch (error) {
        console.error("Error fetching Daily Double:", error);
    }
}

/** Show loading message */
function showLoadingView() {
    $("#jeopardy-container").html("<p>Loading...</p>");
}

/** Start the game: fetch categories, create the table */
async function setupAndStart() {
    // Reset before fetching categories
    answeredCount = 0;
    gameStarted = true;
    $("body").removeClass("daily-double-active");
    $(".modal-overlay").remove();

    if (!$("#jeopardy-container").length) {
        $("body").append('<div id="jeopardy-container"></div>');
    }

    showLoadingView();
    categories = [];

    try {
        const categoryIds = await getCategoryIds();

        categories = await Promise.all(categoryIds.map(id => getCategory(id)));

        fillTable();
        createRestartButton();
    } catch (error) {
        console.error("Error fetching data:", error);
        $("#jeopardy-container").html("<p>Error loading game. Try again.</p>");
    }
}

/** Create start modal */
function createStartModal() {
    const modal = $("<div>", { id: "start-modal", class: "modal-overlay" });
    const modalContent = $("<div>", { class: "modal-content" });

    modalContent.append($("<h2>").text("Welcome to Jeopardy!"));
    const startBtn = $("<button>").text("Start Game").addClass("start-btn").on("click", () => {
        modal.remove();
        setupAndStart();
    });

    modalContent.append(startBtn);
    modal.append(modalContent);
    $("body").append(modal);
}

/** Create restart button */
function createRestartButton() {
    $("#restart-btn").remove();
    $(".modal-overlay").remove();

    const restartBtn = $("<button>", { id: "restart-btn" })
        .text("Restart Game")
        .addClass("restart-btn")
        .on("click", setupAndStart);

    $("#jeopardy-container").append(restartBtn);
}

/** Initialize game on document ready */
$(document).ready(() => {
    createStartModal();
});