const PIN_LENGTH = 6;

function isValidPin(pin) {
  return typeof pin === 'string' && new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

module.exports = {PIN_LENGTH, isValidPin};
