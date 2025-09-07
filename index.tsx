import { initializeUiHandlers } from './js/ui/ui-handlers.js';
import { showSplashScreen } from './js/ui/splash-screen.js';
import { checkForSavedGame } from './js/core/save-load.js';
import { loadAchievements } from './js/core/achievements.js';
import { initializeGoogleSignIn } from './js/core/auth.js';
import { connectToServer } from './js/core/network.js';
import { initI18n } from './js/core/i18n.js';

// This is the main entry point of the application.
// The script is loaded as a module at the end of the body, so the DOM is ready.

// Guard to ensure the init logic runs only once.
if ((window as any).gameHasInitialized) {
    // Already initialized, do nothing.
} else {
    (window as any).gameHasInitialized = true;

    // Async function to run initialization logic.
    const initializeApp = async () => {
        // Initialize internationalization first
        await initI18n();

        // Establish connection with the server for PvP functionalities.
        connectToServer();

        // Sets up all the button clicks and other user interactions.
        initializeUiHandlers();

        // Load any existing achievements from local storage.
        loadAchievements();

        // Checks if a saved game exists to enable the 'Continue' button.
        checkForSavedGame();
        
        // Displays the initial splash screen.
        showSplashScreen();

        // Initializes Google Sign-In functionality
        initializeGoogleSignIn();
    };

    // Run the app initialization.
    initializeApp();
}
