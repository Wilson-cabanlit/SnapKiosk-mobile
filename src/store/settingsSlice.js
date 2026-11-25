const {createSlice} = require('@reduxjs/toolkit');
const {DEFAULT_BRAND, normalizeBrand} = require('../utils/brand');

const initialState = {
  brand: DEFAULT_BRAND,
  adminUnlocked: false,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setBrand(state, action) {
      state.brand = normalizeBrand(action.payload);
    },
    unlockAdmin(state) {
      state.adminUnlocked = true;
    },
    lockAdmin(state) {
      state.adminUnlocked = false;
    },
  },
});

module.exports = {
  ...settingsSlice.actions,
  ...settingsSlice,
  settingsReducer: settingsSlice.reducer,
};
