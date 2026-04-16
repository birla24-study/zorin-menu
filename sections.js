/*
 * Zorin Menu: The official applications menu for Zorin OS.
 *
 * Copyright (C) 2016-2021 Zorin OS Technologies Ltd.
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
const {Clutter, Gio, GLib, GObject, St} = imports.gi;
const PopupMenu = imports.ui.popupMenu;
const Signals = imports.signals;
const SystemActions = imports.misc.systemActions;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;
const Widgets = Me.imports.widgets;
const Search = Me.imports.search
const Constants = Me.imports.constants;
const Utils = Me.imports.utils;

// Session Buttons Section
var SessionButtonsSection = GObject.registerClass({
    Signals: {
        'activated': {}
    },
}, class SessionButtonsSection extends PopupMenu.PopupBaseMenuItem {
    // Initialize the button
    _init() {
        super._init({
            reactive: false,
            can_focus: false,
            style_class: 'session-buttons-section'
        });
        this.x_align = Clutter.ActorAlign.CENTER;
        this.y_align = Clutter.ActorAlign.END;
        this.y_expand = true;
        this._systemActions = new SystemActions.getDefault();
        this._systemActions.forceUpdate();

        // Add session buttons to section
        this._logout = new Widgets.LogoutButton(this._systemActions);
        this._logout.connect('activated', this._activated.bind(this));
        this.add_child(this._logout);

        this._lock = new Widgets.LockButton(this._systemActions);
        this._lock.connect('activated', this._activated.bind(this));
        this.add_child(this._lock);

        this._restart = new Widgets.RestartButton(this._systemActions);
        this._restart.connect('activated', this._activated.bind(this));
        this.add_child(this._restart);

        this._power = new Widgets.PowerButton(this._systemActions);
        this._power.connect('activated', this._activated.bind(this));
        this.add_child(this._power);
    }

    // Emit signal if one of the buttons is activated
    _activated() {
        this.emit('activated');
    }
});

// Places Shortcut Section
var PlacesSection = GObject.registerClass({
    Signals: {
        'activated': {}
    },
}, class PlacesSection extends St.BoxLayout {
    _init(session, accessible_name, icon_name) {
        super._init({
            vertical: true
        });
        this._items = [];

        // Fix for when XDG User Dirs are empty due to being cached too early during initialization
        GLib.reload_user_special_dirs_cache();

        let homePath = GLib.get_home_dir();
        let placeInfo = new Widgets.PlaceInfo(Gio.File.new_for_path(homePath), _("Home"));
        let placeMenuItem = new Widgets.PlaceMenuItem(placeInfo);
        this._items.push(placeMenuItem);

        for (let i = 0; i < Constants.DEFAULT_DIRECTORIES.length; i++) {
            let path = GLib.get_user_special_dir(Constants.DEFAULT_DIRECTORIES[i]);
            if (path == null || path == homePath)
                continue;
            let placeInfo = new Widgets.PlaceInfo(Gio.File.new_for_path(path));
            let placeMenuItem = new Widgets.PlaceMenuItem(placeInfo);
            this._items.push(placeMenuItem);
        }

        this._items.forEach(function(item) {
            this.add_child(item);
            item.connect('activated', this._activated.bind(this));
        }, this);
    }

    grab_key_focus() {
        let item = this.get_first_child();
        if (item) {
            item.grab_key_focus();
        }
    }

    // Emit signal if one of the buttons is activated
    _activated() {
        this.emit('activated');
    }
});

// Shortcuts Section
var ShortcutsSection = GObject.registerClass({
    Signals: {
        'activated': {}
    },
}, class ShortcutsSection extends St.BoxLayout {
    _init(session, accessible_name, icon_name) {
        super._init({
            vertical: true
        });
        this._items = [];

        let software = new Widgets.ShortcutMenuItem(_("Software"), ["gnome-software"], "gnome-software-symbolic", "org.gnome.Software-symbolic");
        if (software.commandExists())
            this._items.push(software);

        let settings = new Widgets.ShortcutMenuItem(_("Settings"), ["gnome-control-center"], "preferences-system-symbolic");
        if (settings.commandExists())
            this._items.push(settings);

        let zorin_appearance = new Widgets.ShortcutMenuItem(_("Zorin Appearance"), ["zorin-appearance"], "zorin-appearance-symbolic");
        if (zorin_appearance.commandExists())
            this._items.push(zorin_appearance);

        this._items.forEach(function(item) {
            this.add_child(item.actor);
            item.connect('activated', this._activated.bind(this));
        }, this);
    }

    grab_key_focus() {
        let item = this.get_first_child();
        if (item) {
            item.grab_key_focus();
        }
    }

    // Emit signal if one of the buttons is activated
    _activated() {
        this.emit('activated');
    }
});

// Categories List Section
var CategoriesListSection = GObject.registerClass({
    Signals: {
        'selected': { param_types: [GObject.TYPE_STRING] },
    },
}, class CategoriesListSection extends St.Bin {
    // Initialize the button
    _init(appsBackend) {
        super._init({ x_expand: true, y_expand: true});
        this._appsBackend = appsBackend;
        this._categories = [];
        this._categoryButtons = new Map();
        this._categoriesBox = new St.BoxLayout({ vertical: true });
        this._scrollBox = new Widgets.ScrollView({
                x_expand: true,
                y_expand: true, 
                y_align: Clutter.ActorAlign.START,
                style_class: 'apps-menu vfade',
                overlay_scrollbars: true,
                reactive:true
        });

        this._scrollBox.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        this._scrollBox.clip_to_allocation = true;
        this._scrollBox.get_vscroll_bar().hide();
        this._scrollBox.add_actor(this._categoriesBox); // Only use add_actor as add_child and set_child don't work with scrollviews
        this.set_child(this._scrollBox);
        this._load();
        this._reloadId = this._appsBackend.connect('reload', this._reload.bind(this));
        this.connect('destroy', this._onDestroy.bind(this));
    }

    _load() {
        this._categories = this._appsBackend.getCategories();
        this._categories.forEach(this._addCategoryButton, this);
    }

    _reload() {
        this._categories = [];
        this._clear();
        this._load();
    }

    _addCategoryButton(category) {
        let button = this._categoryButtons.get(category);
        if (!button) {
            button = new Widgets.CategoryMenuItem(category);
            this._categoryButtons.set(category, button);
            button.connect('selected', this._selected.bind(this));
        }
        if (!button.get_parent()) {
            this._categoriesBox.add_child(button);
        }
    }

    // Clear the categories box
    _clear() {
        this._categoriesBox.remove_all_children();
    }

    _selected(actor, category_menu_id) {
        this.emit('selected', category_menu_id);
    }

    grab_key_focus() {
        let item = this._categoriesBox.get_first_child();
        if (item) {
            item.grab_key_focus();
        }
    }

    show() {
        super.show();
        let item = this._categoriesBox.get_first_child();
        if (item) {
            item.grab_key_focus();
        }
    }

    _onDestroy() {
        this._appsBackend.disconnect(this._reloadId);
        this._reloadId = 0;
        this._categories = null;
        this._categoryButtons.clear();
    }
});

// Apps List Section
var AppsListSection = GObject.registerClass({
    Signals: {
        'activated': {},
    },
}, class AppsListSection extends St.Bin {
    // Initialize the button
    _init(appsBackend, isGrid) {
        super._init({ x_expand: true, y_expand: true});
        this._appsBackend = appsBackend;
        this._appButtons = new Map();
        this._category = null;
        this._searchTerms = [];
        this.searchResults = new Search.SearchResults(isGrid);
        this.searchResults.connect('activated', this._activated.bind(this));
        this._appsBox = new St.BoxLayout({ vertical: true });

        if (isGrid) {
            this.grid = new Widgets.Grid(Constants.COLUMN_COUNT, Constants.COLUMN_SPACING, Constants.ROW_SPACING);
            this._appsBox.add(this.grid);
        }
        this._scrollBox = new Widgets.ScrollView({
                x_expand: true,
                y_expand: true, 
                y_align: Clutter.ActorAlign.START,
                style_class: 'apps-menu vfade',
                overlay_scrollbars: true,
                reactive:true
        });
        this._scrollBox.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        this._scrollBox.clip_to_allocation = true;
        this._scrollBox.get_vscroll_bar().hide();
        this._scrollBox.add_actor(this._appsBox); // Only use add_actor as add_child and set_child don't work with scrollviews
        this.set_child(this._scrollBox);
        this._load();
        this._reloadId = this._appsBackend.connect('reload', this._reload.bind(this));
        this.connect('destroy', this._onDestroy.bind(this));
    }

    _display(apps) {
        if (this.grid) {
            if (!this._appsBox.contains(this.grid)) {
                this._appsBox.add_child(this.grid);
            }
            this.grid.show();
        }

        if (apps) {
            apps.forEach(this._addAppButton, this);
        }
    }

    _load() {
        if (this._category) {
            this.selectCategory(this._category);
        } else if (this._searchTerms.length > 0) {
            this.searchResults.setTerms(this._searchTerms);
            this.searchActive();
        } else {
            this.displayAllApps();
        }
    }

    _reload() {
        this._searchTerms = this.searchResults.terms;
        this._clear();
        this._load();
        this._searchTerms = [];
    }

    // Emit signal if one of the buttons is activated
    _activated() {
        this.emit('activated');
    }

    _addAppButton(app) {
        let button = this._appButtons.get(app);
        if (!button) {
            button = new Widgets.AppMenuItem(app, (this.grid != null));
            this._appButtons.set(app, button);
            button.connect('activated', this._activated.bind(this));
        }
        if (!button.get_parent()) {
            if (this.grid) {
                this.grid.add_item(button);
            } else {
                this._appsBox.add_child(button);
            }
        }
    }

    // Clear the apps box
    _clear() {
        Utils.blockHover();
        if (this.grid) {
            this.grid.clear();
        }
        this.searchResults.setTerms([]);
        this._appsBox.remove_all_children();
    }

    selectCategory(category_menu_id) {
        if (category_menu_id) {
            this._category = category_menu_id;
            let apps = this._appsBackend.getAppsByCategory(this._category);
            this._clear();
            this._display(apps);
        }
    }

    searchActive() {
        this._category = null;
        this._scrollBox.vscroll.adjustment.set_value(0);
        if (!this._appsBox.contains(this.searchResults)) {
            const terms = this.searchResults.terms;
            this._clear();
            this.searchResults.setTerms(terms);
            this._appsBox.add_child(this.searchResults);
        }
    }

    displayAllApps() {
        this._category = null;
        let apps = this._appsBackend.getAllApps();
        this._clear();
        this._display(apps);
    }

    grab_key_focus() {
        let item = this._appsBox.get_first_child();
        if (item) {
            item.grab_key_focus();
        }
    }

    show() {
        super.show();
        this.grab_key_focus();
    }

    _onDestroy() {
        this._appsBackend.disconnect(this._reloadId);
        this._reloadId = 0;
        this._appButtons.clear();
        this._category = null;
        this.searchResults.destroy();
        this.searchResults = null;
    }
});
