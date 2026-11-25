const {configureStore} = require('@reduxjs/toolkit');
const {settingsReducer} = require('./settingsSlice');

const store = configureStore({
  reducer: {settings: settingsReducer},
});

module.exports = {store};
