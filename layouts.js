/*
 * Zorin Menu: The official applications menu for Zorin OS.
 *
 * Copyright (C) 2016-2023 Zorin OS Technologies Ltd.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

// Import Libraries
const {Clutter, GObject, St} = imports.gi;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Signals = imports.signals;
const SystemActions = imports.misc.systemActions;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;
const Widgets = Me.imports.widgets;
const Sections = Me.imports.sections;
const Constants = Me.imports.constants;
const Utils = Me.imports.utils;

function getLayout(settings, appsBackend) {
    let layoutSetting = settings.get_enum('layout');
    switch(layoutSetting) {
        case Constants.LAYOUTS.ALL:
            return new StandardLayout(appsBackend);
        case Constants.LAYOUTS.APPS_ONLY:
            return new AppListLayout(appsBackend);
        case Constants.LAYOUTS.SYSTEM_ONLY:
            return new ShortcutsLayout(appsBackend);
        case Constants.LAYOUTS.APP_GRID:
            return new AppGridLayout(appsBackend);
        default:
            return new StandardLayout(appsBackend);
    }
}

// Base Layout
var BaseLayout = GObject.registerClass({
    Signals: {
        'activated': {},
        'screenshot-activated': {},
    },
}, class BaseLayout extends St.BoxLayout {
    _init(appsBackend) {
        super._init({
            reactive: true,
            vertical: false
        });

        this._appsBackend = appsBackend;
        this._loadLayout();
        this._connectSignals();
        this.reset();
        this.connect('key-press-event', this._onKeyPress.bind(this));
    }

    _loadLayout() {
    }

    _connectSignals() {
    }

    // Handle key presses
    _onKeyPress(actor, event) {
        Utils.blockHover();

        const symbol = event.get_key_symbol();
        const unicode = Clutter.keysym_to_unicode(symbol);

        if (this._searchEntry && symbol === Clutter.KEY_Control_L || symbol === Clutter.KEY_Control_R) {
            global.stage.set_key_focus(this._searchEntry.clutter_text);
            this._searchEntry.clutter_text.event(event, false);
            return Clutter.EVENT_PROPAGATE;
        }

        switch (symbol) {
        case Clutter.KEY_Tab:
        case Clutter.KEY_ISO_Left_Tab:
        case Clutter.KEY_Up: case Clutter.KEY_KP_Up:
        case Clutter.KEY_Down: case Clutter.KEY_KP_Down:
        case Clutter.KEY_Left: case Clutter.KEY_KP_Left:
        case Clutter.KEY_Right: case Clutter.KEY_KP_Right: {
            let direction;
            if (symbol === Clutter.KEY_Down || symbol === Clutter.KEY_KP_Down)
                direction = St.DirectionType.DOWN;
            else if (symbol === Clutter.KEY_Right || symbol === Clutter.KEY_KP_Right)
                direction = St.DirectionType.RIGHT;
            else if (symbol === Clutter.KEY_Up || symbol === Clutter.KEY_KP_Up)
                direction = St.DirectionType.UP;
            else if (symbol === Clutter.KEY_Left || symbol === Clutter.KEY_KP_Left)
                direction = St.DirectionType.LEFT;
            else if (symbol === Clutter.KEY_Tab)
                direction = St.DirectionType.TAB_FORWARD;
            else if (symbol === Clutter.KEY_ISO_Left_Tab)
                direction = St.DirectionType.TAB_BACKWARD;

            if (this._searchEntry && this._searchEntry.has_key_focus() &&
                this._searchResults.hasActiveResult() && this._searchResults.get_parent()) {
                const topSearchResult = this._searchResults.getTopResult();
                if (topSearchResult.has_style_pseudo_class('focus')) {
                    topSearchResult.grab_key_focus();
                    topSearchResult.remove_style_pseudo_class('focus');
                    return actor.navigate_focus(global.stage.key_focus, direction, false);
                }
                topSearchResult.grab_key_focus();
                return Clutter.EVENT_STOP;
            } else if (global.stage.key_focus === this && symbol === Clutter.KEY_Up) {
                return actor.navigate_focus(global.stage.key_focus, direction, true);
            } else if (global.stage.key_focus === this) {
                if (this._appsSection && this._appsSection.visible) {
                    this._appsSection.grab_key_focus;
                } else if (this._categoriesSection && this._categoriesSection.visible) {
                    this._categoriesSection.grab_key_focus;
                } else if (this._placesSection) {
                    this._placesSection.grab_key_focus;
                }
                return Clutter.EVENT_STOP;
            }
            return actor.navigate_focus(global.stage.key_focus, direction, false);
        }
        case Clutter.KEY_KP_Enter:
        case Clutter.KEY_Return:
        case Clutter.KEY_Escape:
            return Clutter.EVENT_PROPAGATE;
        default:
            if (this._searchEntry?.shouldTriggerSearch(symbol)) {
                this._searchEntry.startSearch(event);
            }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _onSearchEntryKeyPress(actor, event) {
        const symbol = event.get_key_symbol();
        switch (symbol) {
        case Clutter.KEY_Up:
        case Clutter.KEY_Down:
        case Clutter.KEY_Left:
        case Clutter.KEY_Right: {
            let direction;
            if (symbol === Clutter.KEY_Down || symbol === Clutter.KEY_Up)
                return Clutter.EVENT_PROPAGATE;
            if (symbol === Clutter.KEY_Right)
                direction = St.DirectionType.RIGHT;
            if (symbol === Clutter.KEY_Left)
                direction = St.DirectionType.LEFT;

            let cursorPosition = this._searchEntry.clutter_text.get_cursor_position();

            if (cursorPosition === Constants.CaretPosition.END && symbol === Clutter.KEY_Right)
                cursorPosition = Constants.CaretPosition.END;
            else if (cursorPosition === Constants.CaretPosition.START && symbol === Clutter.KEY_Left)
                cursorPosition = Constants.CaretPosition.START;
            else
                cursorPosition = Constants.CaretPosition.MIDDLE;

            if (cursorPosition === Constants.CaretPosition.END || cursorPosition === Constants.CaretPosition.START) {
                let navigateActor = null;
                if (this._searchResults.hasActiveResult()) {
                    navigateActor = this._searchResults.getTopResult();
                    if (navigateActor.has_style_pseudo_class('focus')) {
                        navigateActor.grab_key_focus();
                        navigateActor.remove_style_pseudo_class('focus');
                        return this.navigate_focus(navigateActor, direction, false);
                    }
                    navigateActor.grab_key_focus();
                    return Clutter.EVENT_STOP;
                }
                if (!navigateActor)
                    return Clutter.EVENT_PROPAGATE;
                return this.navigate_focus(navigateActor, direction, false);
            }
            return Clutter.EVENT_PROPAGATE;
        }
        default:
            return Clutter.EVENT_PROPAGATE;
        }
    }

    reset(){
    }

    _availableHeight() {
        const scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let availableHeight = Main.layoutManager.findMonitorForActor(this).height;

        const panelHeight = Main.panel.get_height();
        const panelWidth = Main.panel.get_width();
        if (panelHeight < panelWidth) {
            // Only subtract panel height if panel is horizontal
            availableHeight -= panelHeight;
            availableHeight -= (Constants.AVAIL_HEIGHT_PADDING * scaleFactor);
        }

        return availableHeight;
    }

    updateHeight() {
    }

    _activated() {
        this.emit('activated');
    }

    _onScreenshotActivated() {
        this.emit('screenshot-activated');
    }
});

// Standard Layout
var StandardLayout = GObject.registerClass(
class StandardLayout extends BaseLayout {
    // Initialize the layout
    _init(appsBackend) {
        super._init(appsBackend);
        this.add_style_class_name("main-box");
        this.add_style_class_name("all-layout-box");
    }

    _loadLayout() {
        // Create Sections and Widgets
        this._categoriesSection = new Sections.CategoriesListSection(this._appsBackend);
        this._appsSection = new Sections.AppsListSection(this._appsBackend, false);
        this._searchResults = this._appsSection.searchResults;
        this._searchEntry = new Widgets.SearchEntry(this._searchResults);
        this._allAppsButton = new Widgets.AllAppsMenuItem();
        this._backButton = new Widgets.BackMenuItem();
        this._userItem = new Widgets.UserMenuItem();
        this._placesSection = new Sections.PlacesSection();
        this._shortcutsSection = new Sections.ShortcutsSection();
        this._sessionButtonsSection = new Sections.SessionButtonsSection();
        this._verticalSeparator = new Widgets.VerticalSeparator();

        // Create Boxes
        this._leftBox = new St.BoxLayout({
            x_expand: true,
            y_expand: true,
            vertical: true,
            y_align: Clutter.ActorAlign.FILL,
            style_class: 'apps-box'
        });
        this._rightBox = new St.BoxLayout({
            vertical: true,
            style_class: 'shortcuts-box'
        });

        // Fill Left Box
        this._leftBox.add_child(this._categoriesSection);
        this._leftBox.add_child(this._appsSection);
        this._leftBox.add_child(this._allAppsButton);
        this._leftBox.add_child(this._backButton);
        this._leftBox.add_child(this._searchEntry);

        // Fill Right Box
        this._rightBox.add_child(this._userItem);
        this._userSeparator = new PopupMenu.PopupSeparatorMenuItem();
        this._rightBox.add_child(this._userSeparator);
        this._rightBox.add_child(this._placesSection);
        this._shortcutSectionSeparator = new PopupMenu.PopupSeparatorMenuItem();
        this._rightBox.add_child(this._shortcutSectionSeparator);
        this._rightBox.add_child(this._shortcutsSection);
        let separator = new PopupMenu.PopupSeparatorMenuItem();
        this._rightBox.add_child(separator);
        this._rightBox.add_child(this._sessionButtonsSection);

        // Add Boxes
        this.add_child(this._leftBox);
        this.add_child(this._verticalSeparator.actor);
        this.add_child(this._rightBox);
    }

    _connectSignals() {
        this._categoriesSection.connect('selected', this._onSelectCategory.bind(this));
        this._appsSection.connect('activated', this._activated.bind(this));
        this._searchEntry.connect('notify::search-active', this._onSearchChanged.bind(this));
        this._searchEntry.connectObject('entry-key-press', this._onSearchEntryKeyPress.bind(this), this);
        this._searchResults.connect('screenshot-activated', () => {
            this._onScreenshotActivated();
        });
        this._allAppsButton.connect('activated', this._onAllApps.bind(this));
        this._backButton.connect('activated', this.reset.bind(this));
        this._userItem.connect('activated', this._activated.bind(this));
        this._placesSection.connect('activated', this._activated.bind(this));
        this._shortcutsSection.connect('activated', this._activated.bind(this));
        this._sessionButtonsSection.connect('activated', this._activated.bind(this));
    }

    _onSearchChanged() {
        Utils.blockHover();
        const {searchActive} = this._searchEntry;
        if (searchActive) {
            this._appsSection.searchActive();
            this._categoriesSection.hide();
            this._allAppsButton.hide();
            this._appsSection.show();
            this._backButton.show();
            this._searchEntry.grab_key_focus();
        } else {
            this._appsSection.hide();
            this._backButton.hide();
            this._categoriesSection.show();
            this._allAppsButton.show();
            this._categoriesSection.grab_key_focus();
        }
    }

    _onAllApps(actor) {
        this._onSelectCategory(actor, "all_apps");
    }

    _onSelectCategory(actor, category_menu_id){
        if (category_menu_id) {
            Utils.blockHover();
            this._appsSection.selectCategory(category_menu_id);
            this._categoriesSection.hide();
            this._allAppsButton.hide();
            this._appsSection.show();
            this._backButton.show();
            this._appsSection.grab_key_focus();
        }
    }

    reset() {
        this._searchEntry.clear();
        this._onSearchChanged();
    }

    updateHeight() {
        const scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const availableHeight = this._availableHeight();

        // Ensure shortcuts section and user item are visible for correct height calculation
        this._shortcutSectionSeparator.show();
        this._shortcutsSection.show();
        this._userItem.show();
        this._userSeparator.show();

        let [, naturalHeight] = this._rightBox.get_preferred_height(-1);
        if (naturalHeight > availableHeight) {
            // Hide shortcuts section to make menu more compact and recalculate height
            this._shortcutSectionSeparator.hide();
            this._shortcutsSection.hide();
            [, naturalHeight] = this._rightBox.get_preferred_height(-1);
            if (naturalHeight > availableHeight) {
                // Hide user item to make menu super compact and recalculate height
                this._userItem.hide();
                this._userSeparator.hide();
                [, naturalHeight] = this._rightBox.get_preferred_height(-1);
            }
        }
        this.set_height((naturalHeight > availableHeight) ? availableHeight : naturalHeight);
    }
});

// App List Layout
var AppListLayout = GObject.registerClass(
class AppListLayout extends BaseLayout {
    // Initialize the layout
    _init(appsBackend) {
        super._init(appsBackend);
        this.add_style_class_name("main-box");
        this.add_style_class_name("apps-only-layout-box");
    }

    _loadLayout() {
        // Create Sections and Widgets
        this._categoriesSection = new Sections.CategoriesListSection(this._appsBackend);
        this._appsSection = new Sections.AppsListSection(this._appsBackend, false);
        this._searchResults = this._appsSection.searchResults;
        this._searchEntry = new Widgets.SearchEntry(this._searchResults);
        this._allAppsButton = new Widgets.AllAppsMenuItem();
        this._backButton = new Widgets.BackMenuItem();

        // Create Box
        this._box = new St.BoxLayout({
            vertical: true,
            style_class: 'apps-box'
        });

        // Fill Box
        this._box.add_child(this._categoriesSection);
        this._box.add_child(this._appsSection);
        this._box.add_child(this._allAppsButton);
        this._box.add_child(this._backButton);
        this._box.add_child(this._searchEntry);

        // Add Box
        this.add_child(this._box);
    }

    _connectSignals() {
        this._categoriesSection.connect('selected', this._onSelectCategory.bind(this));
        this._appsSection.connect('activated', this._activated.bind(this));
        this._searchEntry.connect('notify::search-active', this._onSearchChanged.bind(this));
        this._searchEntry.connectObject('entry-key-press', this._onSearchEntryKeyPress.bind(this), this);
        this._searchResults.connect('screenshot-activated', () => {
            this._onScreenshotActivated();
        });
        this._allAppsButton.connect('activated', this._onAllApps.bind(this));
        this._backButton.connect('activated', this.reset.bind(this));
    }

    _onSearchChanged() {
        Utils.blockHover();
        const {searchActive} = this._searchEntry;
        if (searchActive) {
            this._appsSection.searchActive();
            this._categoriesSection.hide();
            this._allAppsButton.hide();
            this._appsSection.show();
            this._backButton.show();
            this._searchEntry.grab_key_focus();
        } else {
            this._appsSection.hide();
            this._backButton.hide();
            this._categoriesSection.show();
            this._allAppsButton.show();
            this._categoriesSection.grab_key_focus();
        }
    }

    _onAllApps(actor) {
        this._onSelectCategory(actor, "all_apps");
    }

    _onSelectCategory(actor, category_menu_id){
        if (category_menu_id) {
            Utils.blockHover();
            this._appsSection.selectCategory(category_menu_id);
            this._categoriesSection.hide();
            this._allAppsButton.hide();
            this._appsSection.show();
            this._backButton.show();
            this._appsSection.grab_key_focus();
        }
    }

    reset(){
        this._searchEntry.clear();
        this._onSearchChanged();
    }

    updateHeight() {
        const scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const availableHeight = this._availableHeight();
        const naturalHeight = Constants.APPS_ONLY_MENU_HEIGHT * scaleFactor;
        this.set_height((naturalHeight > availableHeight) ? availableHeight : naturalHeight);
    }
});

// Shortcuts Layout
var ShortcutsLayout = GObject.registerClass(
class ShortcutsLayout extends BaseLayout {
    // Initialize the layout
    _init(appsBackend) {
        super._init(appsBackend);
        this.add_style_class_name("shortcuts-only-layout-box");
    }

    _loadLayout() {
        // Create Sections and Widgets
        this._userItem = new Widgets.UserMenuItem();
        this._placesSection = new Sections.PlacesSection();
        this._shortcutsSection = new Sections.ShortcutsSection();
        this._sessionButtonsSection = new Sections.SessionButtonsSection();

        // Create Box
        this._box = new St.BoxLayout({
            vertical: true,
            style_class: 'shortcuts-box'
        });

        // Fill Box
        this._box.add_child(this._userItem);
        this._userSeparator = new PopupMenu.PopupSeparatorMenuItem();
        this._box.add_child(this._userSeparator);
        this._box.add_child(this._placesSection);
        this._shortcutSectionSeparator = new PopupMenu.PopupSeparatorMenuItem();
        this._box.add_child(this._shortcutSectionSeparator);
        this._box.add_child(this._shortcutsSection);
        let separator = new PopupMenu.PopupSeparatorMenuItem();
        this._box.add_child(separator);
        this._box.add_child(this._sessionButtonsSection);
        
        // Add Box
        this.add_child(this._box);
    }

    _connectSignals() {
        this._userItem.connect('activated', this._activated.bind(this));
        this._placesSection.connect('activated', this._activated.bind(this));
        this._shortcutsSection.connect('activated', this._activated.bind(this));
        this._sessionButtonsSection.connect('activated', this._activated.bind(this));
    }

    updateHeight() {
        const scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const availableHeight = this._availableHeight();

        // Ensure shortcuts section and user item are visible for correct height calculation
        this._shortcutSectionSeparator.show();
        this._shortcutsSection.show();
        this._userItem.show();
        this._userSeparator.show();

        let [, naturalHeight] = this._box.get_preferred_height(-1);
        if (naturalHeight > availableHeight) {
            // Hide shortcuts section to make menu more compact and recalculate height
            this._shortcutSectionSeparator.hide();
            this._shortcutsSection.hide();
            [, naturalHeight] = this._box.get_preferred_height(-1);
            if (naturalHeight > availableHeight) {
                // Hide user item to make menu super compact and recalculate height
                this._userItem.hide();
                this._userSeparator.hide();
                [, naturalHeight] = this._box.get_preferred_height(-1);
            }
        }
        this.set_height((naturalHeight > availableHeight) ? availableHeight : naturalHeight);
    }
});

// App Grid Layout
var AppGridLayout = GObject.registerClass(
class AppGridLayout extends BaseLayout {
    // Initialize the layout
    _init(appsBackend) {
        super._init(appsBackend);
        this.add_style_class_name("main-box");
        this.add_style_class_name("grid-layout-box");
    }

    _loadLayout() {
        // Create Sections and Widgets
        this._appsSection = new Sections.AppsListSection(this._appsBackend, true);
        this._searchResults = this._appsSection.searchResults;
        this._searchEntry = new Widgets.SearchEntry(this._searchResults);
        this._systemActions = new SystemActions.getDefault();
        this._systemActions.forceUpdate();
        this._userButton = new Widgets.UserMenuButton(this._systemActions);
        this._userButton.x_align = Clutter.ActorAlign.START;
        this._separator = new PopupMenu.PopupSeparatorMenuItem();
        this._power = new Widgets.PowerMenuButton(this._systemActions);
        this._power.x_align = Clutter.ActorAlign.END;
        this._power.x_expand = true;

        // Create and Fill Session Box
        this._sessionBox = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            style_class: 'session-box'
        });
        this._sessionBox.add_child(this._userButton);
        this._sessionBox.add_child(this._power);

        // Create Box
        this._box = new St.BoxLayout({
            vertical: true,
            style_class: 'grid-box'
        });

        // Fill Box
        this._box.add_child(this._searchEntry);
        this._box.add_child(this._appsSection);
        this._box.add_child(this._separator);
        this._box.add_child(this._sessionBox);
        
        // Add Box
        this.add_child(this._box);
    }

    _connectSignals() {
        this._appsSection.connect('activated', this._activated.bind(this));
        this._searchEntry.connect('notify::search-active', this._onSearchChanged.bind(this));
        this._searchEntry.connectObject('entry-key-press', this._onSearchEntryKeyPress.bind(this), this);
        this._searchResults.connect('screenshot-activated', () => {
            this._onScreenshotActivated();
        });
        this._userButton.connect('activated', this._activated.bind(this));
        this._power.connect('activated', this._activated.bind(this));
    }

    _onSearchChanged() {
        Utils.blockHover();
        const {searchActive} = this._searchEntry;
        if (searchActive) {
            this._appsSection.searchActive();
            this._searchEntry.grab_key_focus();
        } else {
            this._appsSection.displayAllApps();
            this._appsSection.grab_key_focus();
        }
    }

    reset(){
        this._searchEntry.clear();
        this._onSearchChanged();
    }

    updateHeight() {
        const scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const availableHeight = this._availableHeight();
        const naturalHeight = Constants.GRID_MENU_HEIGHT * scaleFactor;
        this.set_height((naturalHeight > availableHeight) ? availableHeight : naturalHeight);
    }
});
