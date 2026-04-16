/*
 * Zorin Menu: The official applications menu for Zorin OS.
 *
 * Copyright (C) 2016-2019 Zorin OS Technologies Ltd.
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
const Main = imports.ui.main;
const Shell = imports.gi.Shell;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Menu = Me.imports.menu;
const ExtensionUtils = imports.misc.extensionUtils;

// Initialize panel button variables
let settings;
let zorinMenuButton;

// Initialize menu language translations
function init(metadata) {
    ExtensionUtils.initTranslations();
}

// Enable the extension
function enable() {
    settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.zorin-menu');

    // Add Zorin Menu Button to Panel
    zorinMenuButton = new Menu.ApplicationsButton(settings);
    Main.panel.addToStatusArea('zorin-menu', zorinMenuButton, 0, 'left');
}

// Disable the extension
function disable() {
    // Disable Zorin Menu Button
    Main.panel.menuManager.removeMenu(zorinMenuButton.menu);
    zorinMenuButton.destroy();
    zorinMenuButton = null;

    // Disable Zorin Menu Settings
    settings.run_dispose();
    settings = null;
}
