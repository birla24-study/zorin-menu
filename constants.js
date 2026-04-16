const Me = imports.misc.extensionUtils.getCurrentExtension();
const GLib = imports.gi.GLib;

var TOOLTIP_TIMEOUT = 500;
var APP_LIST_ICON_SIZE = 32;
var APP_GRID_ICON_SIZE = 48;

var TooltipLocation = {
    TOP_CENTERED: 0,
    BOTTOM_CENTERED: 1,
    BOTTOM: 2,
};

// Menu Button icon
var ZORIN_ICON = Me.path + '/zorin-icon-symbolic.svg';
var APP_GRID_ICON = Me.path + '/app-grid-symbolic.svg';

// Menu Button padding variable
var MENU_BUTTON_MINIMUM_PADDING = 4;

// Base Menu Button Icon Sizes
var MENU_BUTTON_DEFAULT_PANEL_SIZE = 48;
var MenuButtonIconSizes = [ 16, 24, 32, 48, 64, 96, 128 ];

var ZORIN_PANEL_UUID = 'zorin-taskbar@zorinos.com';
var ZORIN_PANEL_SETTINGS_SCHEMA = 'org.gnome.shell.extensions.zorin-taskbar';

var DASH_TO_PANEL_UUID = 'dash-to-panel@jderose9.github.com';

var SEARCH_PROVIDERS_SCHEMA = 'org.gnome.desktop.search-providers';
var MAX_LIST_SEARCH_RESULTS_ROWS = 5;

var COLUMN_SPACING = 16;
var ROW_SPACING = 16;
var COLUMN_COUNT = 6;

var SCROLL_ANIMATION_DURATION = 0;

// User Home directories
var DEFAULT_DIRECTORIES = [
    GLib.UserDirectory.DIRECTORY_DESKTOP,
    GLib.UserDirectory.DIRECTORY_DOCUMENTS,
    GLib.UserDirectory.DIRECTORY_DOWNLOAD,
    GLib.UserDirectory.DIRECTORY_MUSIC,
    GLib.UserDirectory.DIRECTORY_PICTURES,
    GLib.UserDirectory.DIRECTORY_VIDEOS
];

// Menu Layout Enum
var LAYOUTS = {
    ALL: 0,
    APPS_ONLY: 1,
    SYSTEM_ONLY: 2,
    APP_GRID: 3
};

var APPS_ONLY_MENU_HEIGHT = 542;
var GRID_MENU_HEIGHT = 600;
var AVAIL_HEIGHT_PADDING = 24;
var INTELLIHIDE_TIMEOUT = 750;

var MUTTER_SCHEMA = 'org.gnome.mutter';
var WM_KEYBINDINGS_SCHEMA = 'org.gnome.desktop.wm.keybindings';

var CaretPosition = {
    END: -1,
    START: 0,
    MIDDLE: 2,
};
