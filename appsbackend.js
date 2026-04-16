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
const {Gio, GMenu, Shell} = imports.gi;
const Signals = imports.signals;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;
const appSys = Shell.AppSystem.get_default();
const ParentalControlsManager = imports.misc.parentalControlsManager;

// Apps Backend
var AppsBackend = class {
    constructor() {
        this._categories = [];
        this._appsByCategory = {};
        this._parentalControlsManager = ParentalControlsManager.getDefault();
        this._parentalControlsManager.connect('app-filter-changed', () => {
            this._reload();
        });
        this._load();
        this.reloading = false;
        this._installedChangedId = appSys.connect('installed-changed', this._reload.bind(this));
    }

    allAppsCategory() {
        return {
            get_name: () => _('All Apps'),
            get_menu_id: () => 'all_apps',
            get_icon: () => Gio.icon_new_for_string('view-app-grid-symbolic'),
        };
    }

    // Load data for a single menu category
    _loadCategory(categoryId, dir) {
        let iter = dir.iter();
        let nextType;
        while ((nextType = iter.next()) != GMenu.TreeItemType.INVALID) {
            if (nextType == GMenu.TreeItemType.ENTRY) {
                let entry = iter.get_entry();
                let id;
                try {
                    id = entry.get_desktop_file_id();
                } catch(e) {
                    continue;
                }
                let app = appSys.lookup_app(id);
                if (app && app.get_app_info().should_show() && (this._parentalControlsManager.shouldShowApp(app.app_info)))
                    this._appsByCategory[categoryId].push(app);
            } else if (nextType == GMenu.TreeItemType.DIRECTORY) {
                let subdir = iter.get_directory();
                if (!subdir.get_is_nodisplay())
                    this._loadCategory(categoryId, subdir);
            }
        }
    }

    // Load data for all menu categories
    _load() {
        this._menuTree = new GMenu.Tree({ menu_basename: 'applications.menu', flags: GMenu.TreeFlags.SORT_DISPLAY_NAME });
        this._menuTree.load_sync();
        this._menuTreeChangedId = this._menuTree.connect('changed', this._reload.bind(this));

        let root = this._menuTree.get_root_directory();
        let iter = root.iter();
        let nextType;
        while ((nextType = iter.next()) != GMenu.TreeItemType.INVALID) {
            if (nextType == GMenu.TreeItemType.DIRECTORY) {
                let dir = iter.get_directory();
                if (!dir.get_is_nodisplay()) {
                    let categoryId = dir.get_menu_id();
                    this._appsByCategory[categoryId] = [];
                    this._loadCategory(categoryId, dir);
                    if (this._appsByCategory[categoryId].length > 0) {
                        this._categories.push(dir);
                    }
                }
            }
        }
    }

    // Reload data for all menu categories
    _reload() {
        if (this.reloading) {
            return
        }
        this.reloading = true;
        if (this._menuTree) {
            if (this._menuTreeChangedId) {
                this._menuTree.disconnect(this._menuTreeChangedId);
            }
            this._menuTree = null;
        }
        this._menuTreeChangedId = null;
        this._categories = [];
        this._appsByCategory = {};
        this._load();
        this.reloading = false;
        this.emit('reload');
    }

    // Return a list of all apps (unsorted)
    _allApps() {
        let apps = [];

        // Get all apps
        for (let directory in this._appsByCategory)
            apps = apps.concat(this._appsByCategory[directory]);
        return apps;
    }

    // Return a list of all apps (sorted)
    getAllApps() {
        let apps = this._allApps();

        // Sort the apps
        apps.sort(function(a,b) {
            return a.get_name().toLowerCase() > b.get_name().toLowerCase();
        });

        return apps;
    }

    // Return a list of apps for a category (sorted)
    getAppsByCategory(category_menu_id) {
        let apps = [];
        if (category_menu_id == "all_apps") {
            return this.getAllApps();
        }

        if (category_menu_id) {
            // Get apps for a category
            apps = this._appsByCategory[category_menu_id].slice();

            // Sort the apps
            apps.sort(function(a,b) {
                return a.get_name().toLowerCase() > b.get_name().toLowerCase();
            });
        }
        return apps;
    }

    // Return a list of apps that match a certain pattern (sorted by relevance)
    searchApps(pattern) {
        let apps = [];
        if (pattern) {
            apps = this._allApps();
            let searchResults = [];
            for (let i in apps) {
                let app = apps[i];
                let info = Gio.DesktopAppInfo.new (app.get_id());
                let match = app.get_name().toLowerCase() + " ";
                if (info.get_display_name()) match += info.get_display_name().toLowerCase() + " ";
                if (info.get_executable()) match += info.get_executable().toLowerCase() + " ";
                if (info.get_keywords()) match += info.get_keywords().toString().toLowerCase() + " ";
                if (app.get_description()) match += app.get_description().toLowerCase();
                let index = match.indexOf(pattern);
                if (index != -1) {
                    searchResults.push([index, app]);
                }
            }

            // Sort results by relevance score
            searchResults.sort(function(a,b) {
                return a[0] > b[0];
            });
            apps = searchResults.map(function(value,index) { return value[1]; });
        }
        return apps;
    }

    // Return a list of all apps (sorted)
    getCategories() {
        return this._categories.slice();
    }

    // Destroy the Apps Backend object
    destroy() {
        if (this._installedChangedId) {
            appSys.disconnect(this._installedChangedId);
            this._installedChangedId = null;
        }
        if (this._menuTree) {
            if (this._menuTreeChangedId) {
                this._menuTree.disconnect(this._menuTreeChangedId);
            }
            this._menuTree = null;
        }
        this._menuTreeChangedId = null;
        this._categories = null;
        this._appsByCategory = null;
        this.emit('destroy');
    }
};
Signals.addSignalMethods(AppsBackend.prototype);
