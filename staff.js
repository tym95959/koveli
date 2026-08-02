// staff.js - Staff management with roles
// Roles: officer (can issue keys) | HK (housekeeping staff)

// Staff data - can be extended or loaded from Firestore
export const staffList = [
  { id: "623", name: "Mohamed", role: "Supervisor", contact: "", pass:"1234"},
  { id: "A-10567", name: "Tholal", role: "Supervisor", contact: "", pass:"1234" },
  { id: "A-7503", name: "Shiara", role: "Supervisor", contact: "", pass:"1234" },
  { id: "T-0160", name: "Sobah", role: "Supervisor", contact: "", pass:"1234" },
  { id: "T-0115", name: "Hussain", role: "Supervisor", contact: "", pass:"1234" },
  { id: "T-0112", name: "Musrifa", role: "Supervisor", contact: "", pass:"1234" },
  { id: "A-4206", name: "Inaz", role: "Supervisor", contact: "", pass:"1234" },
  { id: "A-5209", name: "Hamdulla", role: "Supervisor", contact: "" , pass:"1234"},
  { id: "1081", name: "Fiyaza", role: "officer", contact: "", pass:"1234" },
  { id: "T-0154", name: "Fazana", role: "officer", contact: "" , pass:"1234"},
  { id: "A-3464", name: "H.Haneef", role: "officer", contact: "", pass:"1234" },
  { id: "A-4210", name: "Fazeel", role: "officer", contact: "", pass:"1234" },
  { id: "A-6313", name: "Almas", role: "officer", contact: "", pass:"1234" },
  { id: "A-7068", name: "Maisam", role: "officer", contact: "", pass:"1234" },
  { id: "A-7217", name: "Zihan", role: "officer", contact: "", pass:"1234" },
  { id: "A-7068", name: "Maisam", role: "officer", contact: "", pass:"1234" },
  { id: "A-7751", name: "Shafaq", role: "officer", contact: "" , pass:"1234"},
  { id: "A-8009", name: "Mujahid", role: "officer", contact: "" , pass:"1234"},
  { id: "A-8038", name: "Magrib", role: "officer", contact: "" , pass:"1234"},
  { id: "A-8089", name: "Ruhushath", role: "officer", contact: "", pass:"1234" },
  { id: "A-8156", name: "Jeezan", role: "Supervisor", contact: "", pass:"1234" },
  { id: "A-8551", name: "Liushadha", role: "officer", contact: "" , pass:"1234"},
  { id: "A-8610", name: "Rameez", role: "officer", contact: "" , pass:"1234"},
  { id: "A-8553", name: "Zalma", role: "officer", contact: "" , pass:"1234"},
  { id: "A-8917", name: "Shimmu", role: "officer", contact: "" , pass:"1234"},
  { id: "A-9623", name: "Uoola", role: "officer", contact: "" , pass:"1234"},
  { id: "A-10519", name: "Ainee", role: "officer", contact: "" , pass:"1234"},
  { id: "A-10640", name: "Muzaina", role: "officer", contact: "" , pass:"1234"},
  { id: "A-10886", name: "Sadhina", role: "officer", contact: "" , pass:"1234"},
  { id: "A-11005", name: "Hammaz", role: "officer", contact: "" , pass:"1234"},
  { id: "A-11042", name: "Ashfan", role: "officer", contact: "" , pass:"1234"},
  { id: "A-11045", name: "Humaid", role: "officer", contact: "" , pass:"1234"},
  
  
  { id: "T-0033", name: "Nasrulla", role: "hk", contact: "9795939" },
  { id: "A-4202", name: "I.Easa", role: "hk", contact: "9922552" },
  { id: "A-7465", name: "Wisam", role: "hk", contact: "7765653" },
  { id: "A-8538", name: "Haulath", role: "hk", contact: "7497669" },
  { id: "A-9480", name: "Nasma", role: "hk", contact: "9116702" },
  { id: "A-9476", name: "Fazleena", role: "hk", contact: "9796915" },
  { id: "A-9481", name: "Saffana", role: "hk", contact: "7523657" },
  { id: "A-10827", name: "Shaheedha", role: "hk", contact: "9948945" }

];

// Helper function to get officers (for key issuance)
export function getOfficers() {
  return staffList.filter(staff => staff.role === "officer");
}

// Helper function to get HK staff (for housekeeping allocation)
export function getHousekeepingStaff() {
  return staffList.filter(staff => staff.role === "hk");
}

// Helper function to get staff by ID
export function getStaffById(id) {
  return staffList.find(staff => staff.id === id);
}

// Helper function to get staff by name
export function getStaffByName(name) {
  return staffList.find(staff => staff.name === name);
}
