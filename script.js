const { jsPDF } = window.jspdf;

// Data Storage
let employees = [];
let overtimeEntries = [];
let leaveEntries = [];
let leaveBalances = {};
let panelOvertimeBalances = {};
let fieldOvertimeBalances = {};
let pendingPanelEdits = {};
let pendingFieldEdits = {};
let pendingLeaveEdits = {};
let currentGroupTab = 'AD';
let currentUser = null;
let currentFinancialYear = null;

// Off Days Mapping
const offDays = {
    'A': 'Thursday',
    'B': 'Friday',
    'C': 'Saturday',
    'D': 'Sunday',
    'E': 'Monday',
    'F': 'Tuesday',
    'G': 'Wednesday'
};

// Load Data from Local Storage
function loadFinancialYearData() {
    const yearSelect = document.getElementById('year');
    currentFinancialYear = yearSelect.value;

    employees = JSON.parse(localStorage.getItem(`employees_${currentFinancialYear}`)) || [];
    overtimeEntries = JSON.parse(localStorage.getItem(`overtime_${currentFinancialYear}`)) || [];
    leaveEntries = JSON.parse(localStorage.getItem(`leave_${currentFinancialYear}`)) || [];
    leaveBalances = JSON.parse(localStorage.getItem(`leaveBalances_${currentFinancialYear}`)) || {};
    panelOvertimeBalances = JSON.parse(localStorage.getItem(`panelOvertimeBalances_${currentFinancialYear}`)) || {};
    fieldOvertimeBalances = JSON.parse(localStorage.getItem(`fieldOvertimeBalances_${currentFinancialYear}`)) || {};
    pendingPanelEdits = JSON.parse(localStorage.getItem(`pendingPanelEdits_${currentFinancialYear}`)) || {};
    pendingFieldEdits = JSON.parse(localStorage.getItem(`pendingFieldEdits_${currentFinancialYear}`)) || {};
    pendingLeaveEdits = JSON.parse(localStorage.getItem(`pendingLeaveEdits_${currentFinancialYear}`)) || {};

    if (employees.length === 0) {
        const today = new Date();
        const aprilFirst = new Date(today.getFullYear(), 3, 1); // April 1st
        const prevYear = today.getMonth() < 3 ? `${today.getFullYear() - 2}-${today.getFullYear() - 1}` : `${today.getFullYear() - 1}-${today.getFullYear()}`;
        const prevEmployees = JSON.parse(localStorage.getItem(`employees_${prevYear}`)) || [];
        const prevOvertime = JSON.parse(localStorage.getItem(`overtime_${prevYear}`)) || [];
        const prevLeave = JSON.parse(localStorage.getItem(`leave_${prevYear}`)) || [];
        const prevLeaveBalances = JSON.parse(localStorage.getItem(`leaveBalances_${prevYear}`)) || {};
        const prevPanelOvertimeBalances = JSON.parse(localStorage.getItem(`panelOvertimeBalances_${prevYear}`)) || {};
        const prevFieldOvertimeBalances = JSON.parse(localStorage.getItem(`fieldOvertimeBalances_${prevYear}`)) || {};

        if (today >= aprilFirst) {
            const totalFieldOvertime = prevEmployees.map(emp => {
                return prevOvertime
                    .filter(entry => entry.serial === emp.serial && entry.fullyApproved && entry.type === 'Field')
                    .reduce((sum, entry) => sum + (entry.isCCL ? 1.5 : entry.count), 0) + (prevFieldOvertimeBalances[emp.serial] || 0);
            });
            const avgFieldOvertime = totalFieldOvertime.length > 0 ? Math.round(totalFieldOvertime.reduce((sum, val) => sum + val, 0) / totalFieldOvertime.length) : 0;

            employees = prevEmployees.map(emp => {
                const empFieldOvertime = prevOvertime
                    .filter(entry => entry.serial === emp.serial && entry.fullyApproved && entry.type === 'Field')
                    .reduce((sum, entry) => sum + (entry.isCCL ? 1.5 : entry.count), 0);
                                const empPanelOvertime = prevOvertime
                    .filter(entry => entry.serial === emp.serial && entry.fullyApproved && entry.type === 'Panel' && new Date(entry.date) >= new Date(`${parseInt(yearSelect.value.split('-')[0]) - 1}-01-01`) && new Date(entry.date) <= new Date(`${parseInt(yearSelect.value.split('-')[0]) - 1}-03-31`))
                    .reduce((sum, entry) => sum + (entry.isCCL ? 1.5 : entry.count), 0);
                const empLeave = prevLeave
                    .filter(entry => entry.serial === emp.serial && entry.fullyApproved && entry.leaveType === 'Count')
                    .reduce((sum, entry) => sum + entry.leaveDays, 0);
                const prevFieldBalance = prevFieldOvertimeBalances[emp.serial] || 0;
                const prevPanelBalance = prevPanelOvertimeBalances[emp.serial] || 0;
                const prevLeaveBalance = prevLeaveBalances[emp.serial] || 0;

                let newFieldBalance = empFieldOvertime + prevFieldBalance - avgFieldOvertime;
                let newPanelBalance = empPanelOvertime + prevPanelBalance;
                let newLeaveBalance = empLeave + prevLeaveBalance - 36;
                if (newLeaveBalance < 0) {
                    newFieldBalance += Math.abs(newLeaveBalance);
                    newLeaveBalance = 0;
                }

                fieldOvertimeBalances[emp.serial] = newFieldBalance;
                panelOvertimeBalances[emp.serial] = newPanelBalance;
                leaveBalances[emp.serial] = newLeaveBalance;

                return {
                    name: emp.name,
                    group: emp.group,
                    serial: emp.serial,
                    position: emp.position || emp.serial,
                    password: emp.password,
                    offDay: emp.offDay,
                    year: currentFinancialYear,
                    yearType: 'financial'
                };
            });
            saveData();
        }
    }

    displayEmployees();
    updateOvertimeEmployeeDropdown();
    updateLeaveEmployeeDropdown();
    updateSearchEmployeeDropdown();
    displayOvertimeBalance();
    displayLeaveBalance();
    if (currentUser) openTab(document.querySelector('.tab.active').id);
}

// Reset Panel Overtime (10-day window: Dec 31st - Jan 10th)
function resetPanelOvertime() {
    if (!currentUser || currentUser.position > 2) {
        alert('Only employees with Position 1 or 2 can reset Panel OT.');
        return;
    }
    const today = new Date();
    const year = today.getFullYear();
    const startReset = new Date(year, 11, 31);
    const endReset = new Date(year + 1, 0, 10);
    if (today >= startReset && today <= endReset) {
        Object.keys(panelOvertimeBalances).forEach(serial => {
            panelOvertimeBalances[serial] = 0;
        });
        saveData();
        displayOvertimeBalance();
        showNotification('Panel OT balances have been reset.');
    } else {
        showNotification('Reset only allowed between December 31st and January 10th.');
    }
}

// Save Data to Local Storage
function saveData() {
    localStorage.setItem(`employees_${currentFinancialYear}`, JSON.stringify(employees));
    localStorage.setItem(`overtime_${currentFinancialYear}`, JSON.stringify(overtimeEntries));
    localStorage.setItem(`leave_${currentFinancialYear}`, JSON.stringify(leaveEntries));
    localStorage.setItem(`leaveBalances_${currentFinancialYear}`, JSON.stringify(leaveBalances));
    localStorage.setItem(`panelOvertimeBalances_${currentFinancialYear}`, JSON.stringify(panelOvertimeBalances));
    localStorage.setItem(`fieldOvertimeBalances_${currentFinancialYear}`, JSON.stringify(fieldOvertimeBalances));
    localStorage.setItem(`pendingPanelEdits_${currentFinancialYear}`, JSON.stringify(pendingPanelEdits));
    localStorage.setItem(`pendingFieldEdits_${currentFinancialYear}`, JSON.stringify(pendingFieldEdits));
    localStorage.setItem(`pendingLeaveEdits_${currentFinancialYear}`, JSON.stringify(pendingLeaveEdits));
}

// Populate and Update Year Dropdown (Financial Year Only)
function updateYearOptions() {
    const yearSelect = document.getElementById('year');
    const searchYearSelect = document.getElementById('searchYear');
    const today = new Date();
    const currentYear = today.getMonth() < 3 ? today.getFullYear() - 1 : today.getFullYear();
    yearSelect.innerHTML = '';
    searchYearSelect.innerHTML = '<option value="" disabled selected>Select Year</option>';
    for (let i = 2023; i <= 2100; i++) {
        let option = document.createElement('option');
        option.value = `${i}-${(i + 1).toString().slice(-2)}`;
        option.text = `${i}-${(i + 1).toString().slice(-2)}`;
        yearSelect.appendChild(option.cloneNode(true));
        searchYearSelect.appendChild(option);
    }
    yearSelect.value = `${currentYear}-${(currentYear + 1).toString().slice(-2)}`;
    loadFinancialYearData();
}

// Initialize year options on page load
updateYearOptions();

// Show Landing Section
function showLandingSection() {
    document.getElementById('landingSection').style.display = 'block';
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('resetPasswordSection').style.display = 'none';
    document.getElementById('registerSection').style.display = 'none';
    document.querySelector('.container').style.display = 'none';
}

// Show Login Section
function showLoginSection() {
    document.getElementById('landingSection').style.display = 'none';
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('resetPasswordSection').style.display = 'none';
    document.getElementById('registerSection').style.display = 'none';
}

// Show Register Section (Initial Registration)
function showRegisterSection() {
    document.getElementById('landingSection').style.display = 'none';
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('resetPasswordSection').style.display = 'none';
    document.getElementById('registerSection').style.display = 'block';
}

// Login Function
function login(event) {
    event.preventDefault();
    const userId = document.getElementById('loginUserId').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;
    const employee = employees.find(emp => emp.name.toLowerCase() === userId && emp.password === password);
    if (employee) {
        currentUser = employee;
        document.getElementById('loginSection').style.display = 'none';
        document.querySelector('.container').style.display = 'block';
        document.getElementById('loggedInUser').textContent = `Logged in as: ${currentUser.name} (Position: ${currentUser.position})`;
        document.getElementById('resetPanelOTBtn').style.display = currentUser.position <= 2 ? 'block' : 'none';
        document.getElementById('swapPositionBtn').style.display = currentUser.position <= 2 ? 'block' : 'none';
        document.getElementById('registerFormContainer').style.display = currentUser.position <= 2 ? 'block' : 'none';
        displayEmployees();
        updateOvertimeEmployeeDropdown();
        updateLeaveEmployeeDropdown();
        updateSearchEmployeeDropdown();
        displayOvertimeBalance();
        displayLeaveBalance();
        openTab('registration');
    } else {
        alert('Invalid User ID or Password!');
    }
}

// Show Reset Password Section
function showResetPassword() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('resetPasswordSection').style.display = 'block';
}

// Reset Password Function
function resetPassword(event) {
    event.preventDefault();
    const userId = document.getElementById('resetUserId').value.trim().toLowerCase();
    const adminSerial = parseInt(document.getElementById('adminSerial').value);
    const adminPassword = document.getElementById('adminPassword').value;
    const newPassword = document.getElementById('newPassword').value;

    const employee = employees.find(emp => emp.name.toLowerCase() === userId);
    const admin = employees.find(emp => emp.serial === adminSerial && emp.password === adminPassword);

    if (!employee) {
        alert('User ID not found!');
        return;
    }
    if (adminSerial < 1 || adminSerial > 2) {
        alert('Admin Serial must be 1 to 2!');
        return;
    }
    if (!admin) {
        alert('Invalid Admin Serial or Password!');
        return;
    }

    employee.password = newPassword;
    saveData();
    showNotification(`Password for ${employee.name} reset successfully! Please log in with your new password.`);
    showLoginSection();
    document.getElementById('resetPasswordForm').reset();
}

// Show Notification
function showNotification(message) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.style.display = 'block';
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// Logout Function
function logout() {
    currentUser = null;
    document.querySelector('.container').style.display = 'none';
    showLandingSection();
    document.getElementById('loginForm').reset();
    document.getElementById('loggedInUser').textContent = '';
}

// Tab Functionality
function openTab(tabName) {
    const tabs = document.getElementsByClassName('tab');
    const tabButtons = document.getElementsByClassName('tab-nav')[0].getElementsByTagName('button');
    for (let tab of tabs) {
        tab.classList.remove('active');
    }
    for (let btn of tabButtons) {
        btn.classList.remove('active');
    }
    document.getElementById(tabName).classList.add('active');
    for (let btn of tabButtons) {
        if (btn.getAttribute('onclick') === `openTab('${tabName}')`) {
            btn.classList.add('active');
        }
    }
    if (tabName === 'overtime') {
        updateOvertimeEmployeeDropdown();
        displayOvertime();
        displayOvertimeBalance();
    } else if (tabName === 'leave') {
        updateLeaveEmployeeDropdown();
        displayLeave();
        displayLeaveBalance();
    } else if (tabName === 'search') {
        updateSearchEmployeeDropdown();
    } else if (tabName === 'statistics') {
        displayStatistics();
    } else if (tabName === 'groupCombo') {
        displayGroupCombination(currentGroupTab);
    } else if (tabName === 'registration') {
        displayEmployees();
        document.getElementById('registerFormContainer').style.display = currentUser && currentUser.position <= 2 ? 'block' : 'none';
    }
}

// Register Initial Employee (Pre-Login)
function registerInitialEmployee(event) {
    event.preventDefault();
    const name = document.getElementById('initialEmpName').value.trim();
    const group = document.getElementById('initialEmpGroup').value;
    const password = document.getElementById('initialEmpPassword').value;
    const year = document.getElementById('year').value;

    if (employees.some(emp => emp.name.toLowerCase() === name.toLowerCase() && emp.year === year)) {
        alert(`Employee "${name}" is already registered for ${year}!`);
        return;
    }

    const serial = employees.length + 1;
    const position = serial;
    const offDay = offDays[group];
    const employee = { name, group, serial, position, password, offDay, year: year, yearType: 'financial' };
    employees.push(employee);
    leaveBalances[serial] = 0;
    panelOvertimeBalances[serial] = 0;
    fieldOvertimeBalances[serial] = 0;
    saveData();
    document.getElementById('initialEmployeeForm').reset();
    showNotification(`Employee "${name}" registered successfully! Please log in with User ID: "${name}" and your password.`);
    showLoginSection();
}

// Register Employee (Post-Login by Position 1-2)
function registerEmployee(event) {
    event.preventDefault();
    const name = document.getElementById('empName').value.trim();
    const group = document.getElementById('empGroup').value;
    const password = document.getElementById('empPassword').value;
    const year = document.getElementById('year').value;

    if (!currentUser || currentUser.position > 2) {
        alert('Only employees with Position 1 or 2 can register new employees.');
        return;
    }

    if (employees.some(emp => emp.name.toLowerCase() === name.toLowerCase() && emp.year === year)) {
        alert(`Employee "${name}" is already registered for ${year}!`);
        return;
    }

    const serial = employees.length + 1;
    const position = serial;
    const offDay = offDays[group];
    const employee = { name, group, serial, position, password, offDay, year: year, yearType: 'financial' };
    employees.push(employee);
    leaveBalances[serial] = 0;
    panelOvertimeBalances[serial] = 0;
    fieldOvertimeBalances[serial] = 0;
    saveData();
    document.getElementById('employeeForm').reset();
    displayEmployees();
    showNotification(`Employee "${name}" registered successfully!`);
}

// Display Registered Employees with Position
function displayEmployees() {
    const employeeList = document.getElementById('employeeList');
    employeeList.innerHTML = '<h3>Registered Employees</h3>';
    employees.sort((a, b) => a.position - b.position);
    employees.forEach((emp, index) => {
        const paddedName = emp.name.padEnd(10, ' ');
        employeeList.innerHTML += `
            <p>${emp.position}. ${paddedName} ${emp.group} - Off Day: ${emp.offDay} (Serial: ${emp.serial})
            <button class="delete" onclick="showDeleteModal('employee', ${index}, 'Are you sure you want to delete ${emp.name}?')" ${currentUser && currentUser.position <= 2 ? '' : 'style="display:none;"'}><i class="fas fa-trash"></i> Delete</button></p>`;
    });
}

// Prompt Swap Positions (Restricted to Position 1-2)
function promptSwapPositions() {
    if (!currentUser || currentUser.position > 2) {
        alert('Only employees with Position 1 or 2 can swap positions.');
        return;
    }
    const serialA = parseInt(prompt('Enter the serial number of the first employee to swap positions:'));
    const serialB = parseInt(prompt('Enter the serial number of the second employee to swap positions:'));
    if (isNaN(serialA) || isNaN(serialB) || serialA === serialB || !employees.some(emp => emp.serial === serialA) || !employees.some(emp => emp.serial === serialB)) {
        alert('Invalid serial numbers. Please enter valid, distinct serial numbers of existing employees.');
        return;
    }
    swapEmployeePositions(serialA, serialB);
}

// Swap Employee Positions
function swapEmployeePositions(serialA, serialB) {
    const employeeA = employees.find(emp => emp.serial === serialA);
    const employeeB = employees.find(emp => emp.serial === serialB);
    const tempPosition = employeeA.position;
    employeeA.position = employeeB.position;
    employeeB.position = tempPosition;
    saveData();
    displayEmployees();
    if (currentUser.serial === serialA || currentUser.serial === serialB) {
        currentUser = employees.find(emp => emp.serial === currentUser.serial);
        document.getElementById('loggedInUser').textContent = `Logged in as: ${currentUser.name} (Position: ${currentUser.position})`;
        document.getElementById('resetPanelOTBtn').style.display = currentUser.position <= 2 ? 'block' : 'none';
        document.getElementById('swapPositionBtn').style.display = currentUser.position <= 2 ? 'block' : 'none';
        document.getElementById('registerFormContainer').style.display = currentUser.position <= 2 ? 'block' : 'none';
    }
    showNotification(`Positions swapped: ${employeeA.name} (Serial ${serialA}) to Position ${employeeA.position}, ${employeeB.name} (Serial ${serialB}) to Position ${employeeB.position}`);
}

// Delete Employee
function deleteEmployee(index) {
    if (!currentUser || currentUser.position > 2) {
        alert('Only employees with Position 1 to 2 can delete entries.');
        return;
    }
    const serial = employees[index].serial;
    employees.splice(index, 1);
    employees.forEach(emp => {
        if (emp.position > serial) emp.position--;
    });
    overtimeEntries = overtimeEntries.filter(entry => entry.serial !== serial);
    leaveEntries = leaveEntries.filter(entry => entry.serial !== serial);
    delete leaveBalances[serial];
    delete panelOvertimeBalances[serial];
    delete fieldOvertimeBalances[serial];
    delete pendingPanelEdits[serial];
    delete pendingFieldEdits[serial];
    delete pendingLeaveEdits[serial];
    saveData();
    displayEmployees();
    displayOvertime();
    displayLeave();
    displayLeaveBalance();
    displayOvertimeBalance();
    displayStatistics();
    displayGroupCombination(currentGroupTab);
    updateOvertimeEmployeeDropdown();
    updateLeaveEmployeeDropdown();
    updateSearchEmployeeDropdown();
}

// Update Overtime Employee Dropdown
function updateOvertimeEmployeeDropdown() {
    const overtimeEmployeeSelect = document.getElementById('overtimeEmployee');
    overtimeEmployeeSelect.innerHTML = '<option value="" disabled selected>Select Employee</option>';
    employees.sort((a, b) => a.position - b.position);
    employees.forEach(emp => {
        const option = document.createElement('option');
        option.value = emp.serial;
        option.text = `${emp.position}. ${emp.name} (${emp.group})`;
        overtimeEmployeeSelect.appendChild(option);
    });
}

// Check if Date is Employee's Off Day
function isOffDay(serial, date) {
    const employee = employees.find(emp => emp.serial === serial);
    const dateObj = new Date(date);
    const day = dateObj.toLocaleString('en-US', { weekday: 'long' });
    return employee && employee.offDay === day;
}

// Submit Overtime
function submitOvertime(event) {
    event.preventDefault();
    const serial = parseInt(document.getElementById('overtimeEmployee').value);
    const date = document.getElementById('overtimeDate').value;
    const type = document.getElementById('overtimeType').value;
    const category = document.getElementById('overtimeCategory').value;

    if (overtimeEntries.some(entry => entry.serial === serial && entry.date === date)) {
        const emp = employees.find(e => e.serial === serial);
        alert(`Overtime entry for ${emp.name} on ${date} already exists!`);
        return;
    }

    const isCCL = isOffDay(serial, date) && type !== 'Free';
    const count = 1;
    const totalOTValue = type === 'Free' ? 0 : (isCCL ? 1.5 : 1);
    const overtime = { 
        serial, 
        date, 
        type, 
        category, 
        approvals: { 1: false, 2: false }, 
        fullyApproved: false,
        isCCL,
        count,
        totalOTValue
    };
    overtimeEntries.push(overtime);
    saveData();
    displayOvertime();
    displayOvertimeBalance();
    document.getElementById('overtimeForm').reset();
}

// Display Overtime Entries with Multi-Approval
function displayOvertime() {
    const overtimeList = document.getElementById('overtimeList');
    overtimeList.innerHTML = '<h3>Overtime Entries</h3>';
    overtimeEntries.forEach((entry, index) => {
        const emp = employees.find(e => e.serial === entry.serial);
        if (emp) {
            const approvalStatus = entry.fullyApproved ? 'Approved' : `Pending (Approved by: ${Object.values(entry.approvals).filter(Boolean).length}/2)`;
            const className = entry.fullyApproved ? '' : 'pending';
            const canApprove = currentUser && currentUser.position <= 2 && !entry.approvals[currentUser.position];
            const canDelete = currentUser && currentUser.position <= 2;
            overtimeList.innerHTML += `
                <p class="${className}">
                    ${emp.position}. ${emp.name.padEnd(10, ' ')} ${emp.group} - ${entry.date} - ${entry.type} - ${entry.category}${entry.isCCL ? ' (CCL: 1)' : ''} - ${approvalStatus}
                    ${canApprove ? `<button onclick="approveOvertime(${index})"><i class="fas fa-check"></i> Approve</button>` : ''}
                    ${canDelete ? `<button class="delete" onclick="showDeleteModal('overtime', ${index}, 'Are you sure you want to delete this overtime entry?')"><i class="fas fa-trash"></i> Delete</button>` : ''}
                </p>`;
        }
    });
}

// Approve Overtime (Requires Position 1 and 2)
function approveOvertime(index) {
    if (!currentUser || currentUser.position > 2) {
        alert('Only employees with Position 1 or 2 can approve overtime.');
        return;
    }
    overtimeEntries[index].approvals[currentUser.position] = true;
    if (Object.values(overtimeEntries[index].approvals).every(status => status)) {
        overtimeEntries[index].fullyApproved = true;
        showNotification(`Overtime for Serial ${overtimeEntries[index].serial} fully approved!`);
    } else {
        showNotification(`Overtime for Serial ${overtimeEntries[index].serial} approved by ${currentUser.name}. Awaiting other approval.`);
    }
    saveData();
    displayOvertime();
    displayOvertimeBalance();
    displayStatistics();
    displayGroupCombination(currentGroupTab);
}

// Calculate Overtime Done
function calculatePanelOvertimeDone(serial) {
    return overtimeEntries
        .filter(entry => entry.serial === serial && entry.type === 'Panel' && entry.fullyApproved)
        .reduce((sum, entry) => sum + entry.totalOTValue, 0);
}

function calculateFieldOvertimeDone(serial) {
    return overtimeEntries
        .filter(entry => entry.serial === serial && entry.type === 'Field' && entry.fullyApproved)
        .reduce((sum, entry) => sum + entry.totalOTValue, 0);
}

// Display Overtime Balances with Table Layout and Pending Edits
function displayOvertimeBalance() {
    const overtimeBalanceList = document.getElementById('overtimeBalanceList');
    overtimeBalanceList.innerHTML = '<h3>Overtime Balances</h3>';
    const canEdit = currentUser && currentUser.position <= 2;

    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>Position</th>
                    <th>Name</th>
                    <th>Group</th>
                    <th>Total Panel OT</th>
                    <th>Total Field OT</th>
                    <th>Panel OT Balance</th>
                    <th>Field OT Balance</th>
                </tr>
            </thead>
            <tbody>
    `;

    employees.sort((a, b) => a.position - b.position);
    employees.forEach(emp => {
        const panelBalance = panelOvertimeBalances[emp.serial] || 0;
        const fieldBalance = fieldOvertimeBalances[emp.serial] || 0;
        const panelDone = calculatePanelOvertimeDone(emp.serial);
        const fieldDone = calculateFieldOvertimeDone(emp.serial);
        const totalPanelOT = panelBalance + panelDone;
        const totalFieldOT = fieldBalance + fieldDone;
        const pendingPanelEdit = pendingPanelEdits[emp.serial];
        const pendingFieldEdit = pendingFieldEdits[emp.serial];
        const canApprovePanel = canEdit && pendingPanelEdit && !pendingPanelEdit.approvals[currentUser.position];
        const canApproveField = canEdit && pendingFieldEdit && !pendingFieldEdit.approvals[currentUser.position];
        const canDeletePanel = canEdit && pendingPanelEdit;
        const canDeleteField = canEdit && pendingFieldEdit;

        tableHTML += `
            <tr>
                <td data-label="Position">${emp.position}</td>
                <td data-label="Name">${emp.name.padEnd(10, ' ')}</td>
                <td data-label="Group">${emp.group}</td>
                <td data-label="Total Panel OT">${totalPanelOT}</td>
                <td data-label="Total Field OT">${totalFieldOT}</td>
                <td data-label="Panel OT Balance">
                    ${pendingPanelEdit ? `Pending: ${pendingPanelEdit.value} (Approved by: ${Object.values(pendingPanelEdit.approvals).filter(Boolean).length}/2)` : 
                    (canEdit ? `<input type="number" step="0.5" value="${panelBalance}" onchange="updatePanelOvertimeBalance(${emp.serial}, this.value)">` : `${panelBalance}`)}
                    ${canApprovePanel ? `<button onclick="approvePanelEdit(${emp.serial})"><i class="fas fa-check"></i> Approve</button>` : ''}
                    ${canDeletePanel ? `<button class="delete" onclick="deletePanelEdit(${emp.serial})"><i class="fas fa-trash"></i> Delete</button>` : ''}
                </td>
                <td data-label="Field OT Balance">
                    ${pendingFieldEdit ? `Pending: ${pendingFieldEdit.value} (Approved by: ${Object.values(pendingFieldEdit.approvals).filter(Boolean).length}/2)` : 
                    (canEdit ? `<input type="number" step="0.5" value="${fieldBalance}" onchange="updateFieldOvertimeBalance(${emp.serial}, this.value)">` : `${fieldBalance}`)}
                    ${canApproveField ? `<button onclick="approveFieldEdit(${emp.serial})"><i class="fas fa-check"></i> Approve</button>` : ''}
                    ${canDeleteField ? `<button class="delete" onclick="deleteFieldEdit(${emp.serial})"><i class="fas fa-trash"></i> Delete</button>` : ''}
                </td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;
    overtimeBalanceList.innerHTML += tableHTML;
}

// Update Panel Overtime Balance with Approval
function updatePanelOvertimeBalance(serial, value) {
    if (!currentUser || currentUser.position > 2) {
        alert('Only employees with Position 1 or 2 can modify overtime balances.');
        return;
    }
    const newValue = parseFloat(value) || 0;
    const currentValue = panelOvertimeBalances[serial] || 0;
    if (newValue !== currentValue) {
        pendingPanelEdits[serial] = {
            value: newValue,
            approvals: { 1: currentUser.position === 1, 2: currentUser.position === 2 }
        };
        saveData();
        displayOvertimeBalance();
        showNotification(`Panel OT balance edit for Serial ${serial} submitted for approval (New value: ${newValue}).`);
    }
}

// Update Field Overtime Balance with Approval
function updateFieldOvertimeBalance(serial, value) {
    if (!currentUser || currentUser.position > 2) {
        alert('Only employees with Position 1 or 2 can modify overtime balances.');
        return;
    }
    const newValue = parseFloat(value) || 0;
    const currentValue = fieldOvertimeBalances[serial] || 0;
    if (newValue !== currentValue) {
        pendingFieldEdits[serial] = {
            value: newValue,
            approvals: { 1: currentUser.position === 1, 2: currentUser.position === 2 }
        };
        saveData();
        displayOvertimeBalance();
        showNotification(`Field OT balance edit for Serial ${serial} submitted for approval (New value: ${newValue}).`);
    }
}

// Approve Panel OT Balance Edit
function approvePanelEdit(serial) {
    if (!currentUser || currentUser.position > 2) {
        alert('Only employees with Position 1 or 2 can approve balance edits.');
        return;
    }
    const edit = pendingPanelEdits[serial];
    if (!edit) return;
    edit.approvals[currentUser.position] = true;
    if (Object.values(edit.approvals).every(status => status)) {
        panelOvertimeBalances[serial] = edit.value;
        delete pendingPanelEdits[serial];
        saveData();
        showNotification(`Panel OT balance edit for Serial ${serial} fully approved (New value: ${edit.value}).`);
    } else {
        showNotification(`Panel OT balance edit for Serial ${serial} approved by ${currentUser.name}. Awaiting other approval.`);
        saveData();
    }
    displayOvertimeBalance();
}

// Approve Field OT Balance Edit
function approveFieldEdit(serial) {
    if (!currentUser || currentUser.position > 2) {
        alert('Only employees with Position 1 or 2 can approve balance edits.');
        return;
    }
    const edit = pendingFieldEdits[serial];
    if (!edit) return;
    edit.approvals[currentUser.position] = true;
    if (Object.values(edit.approvals).every(status => status)) {
        fieldOvertimeBalances[serial] = edit.value;
        delete pendingFieldEdits[serial];
        saveData();
        showNotification(`Field OT balance edit for Serial ${serial} fully approved (New value: ${edit.value}).`);
    } else {
        showNotification(`Field OT balance edit for Serial ${serial} approved by ${currentUser.name}. Awaiting other approval.`);
        saveData();
    }
    displayOvertimeBalance();
}

// Delete Pending Panel OT Balance Edit
function deletePanelEdit(serial) {
    if (!currentUser || currentUser.position > 2) {
        alert('Only employees with Position 1 or 2 can delete balance edits.');
        return;
    }
    if (pendingPanelEdits[serial]) {
        delete pendingPanelEdits[serial];
        saveData();
        showNotification(`Pending Panel OT balance edit for Serial ${serial} deleted.`);
        displayOvertimeBalance();
    }
}

// Delete Pending Field OT Balance Edit
function deleteFieldEdit(serial) {
    if (!currentUser || currentUser.position > 2) {
        alert('Only employees with Position 1 or 2 can delete balance edits.');
        return;
    }
    if (pendingFieldEdits[serial]) {
        delete pendingFieldEdits[serial];
        saveData();
        showNotification(`Pending Field OT balance edit for Serial ${serial} deleted.`);
        displayOvertimeBalance();
    }
}

// Update Leave Employee Dropdown
function updateLeaveEmployeeDropdown() {
    const leaveEmployeeSelect = document.getElementById('leaveEmployee');
    leaveEmployeeSelect.innerHTML = '<option value="" disabled selected>Select Employee</option>';
    employees.sort((a, b) => a.position - b.position);
    employees.forEach(emp => {
        const option = document.createElement('option');
        option.value = emp.serial;
        option.text = `${emp.position}. ${emp.name} (${emp.group})`;
        leaveEmployeeSelect.appendChild(option);
    });
}

// Calculate Leave Days
function calculateLeaveDays() {
    const startDate = new Date(document.getElementById('startDate').value);
    const endDate = new Date(document.getElementById('endDate').value);
    const leaveDaysInput = document.getElementById('leaveDays');
    
    if (startDate && endDate && endDate >= startDate) {
        const diffTime = endDate - startDate;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        leaveDaysInput.value = diffDays;
    } else {
        leaveDaysInput.value = '';
    }
}

// Check for Overlapping Leave Entries
function hasOverlappingLeave(serial, newStartDate, newEndDate) {
    const newStart = new Date(newStartDate);
    const newEnd = new Date(newEndDate);
    return leaveEntries.some(entry => {
        if (entry.serial !== serial) return false;
        const existingStart = new Date(entry.startDate);
        const existingEnd = new Date(entry.endDate);
        return newStart <= existingEnd && newEnd >= existingStart;
    });
}

// Submit Leave
function submitLeave(event) {
    event.preventDefault();
    const serial = parseInt(document.getElementById('leaveEmployee').value);
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const leaveType = document.getElementById('leaveType').value;
    const leaveDays = parseInt(document.getElementById('leaveDays').value);

    if (!leaveDays || endDate < startDate) {
        alert('Please ensure valid start and end dates are selected.');
        return;
    }

    if (hasOverlappingLeave(serial, startDate, endDate)) {
        const emp = employees.find(e => e.serial === serial);
        alert(`Leave entry for ${emp.name} overlaps with an existing leave from ${startDate} to ${endDate}!`);
        return;
    }

    const leave = { 
        serial, 
        startDate, 
        endDate, 
        leaveType, 
        leaveDays, 
        approvals: { 1: false, 2: false }, 
        fullyApproved: false 
    };
    leaveEntries.push(leave);
    saveData();
    displayLeave();
    document.getElementById('leaveForm').reset();
}

// Display Leave Entries with Multi-Approval
function displayLeave() {
    const leaveList = document.getElementById('leaveList');
    leaveList.innerHTML = '<h3>Leave Entries</h3>';
    leaveEntries.forEach((entry, index) => {
        const emp = employees.find(e => e.serial === entry.serial);
        if (emp) {
            const approvalStatus = entry.fullyApproved ? 'Approved' : `Pending (Approved by: ${Object.values(entry.approvals).filter(Boolean).length}/2)`;
            const className = entry.fullyApproved ? '' : 'pending';
            const canApprove = currentUser && currentUser.position <= 2 && !entry.approvals[currentUser.position];
            const canDelete = currentUser && currentUser.position <= 2;
            leaveList.innerHTML += `
                <p class="${className}">
                    ${emp.position}. ${emp.name.padEnd(10, ' ')} ${emp.group} - ${entry.startDate} to ${entry.endDate} - ${entry.leaveType} - ${entry.leaveDays} days - ${approvalStatus}
                    ${canApprove ? `<button onclick="approveLeave(${index})"><i class="fas fa-check"></i> Approve</button>` : ''}
                    ${canDelete ? `<button class="delete" onclick="showDeleteModal('leave', ${index}, 'Are you sure you want to delete this leave entry?')"><i class="fas fa-trash"></i> Delete</button>` : ''}
                </p>`;
        }
    });
}

// Approve Leave (Requires Position 1 and 2)
function approveLeave(index) {
    if (!currentUser || currentUser.position > 2) {
        alert('Only employees with Position 1 or 2 can approve leave.');
        return;
    }
    leaveEntries[index].approvals[currentUser.position] = true;
    if (Object.values(leaveEntries[index].approvals).every(status => status)) {
        leaveEntries[index].fullyApproved = true;
        const serial = leaveEntries[index].serial;
        if (leaveEntries[index].leaveType === 'Count') {
            leaveBalances[serial] = (leaveBalances[serial] || 0) + leaveEntries[index].leaveDays;
        }
        showNotification(`Leave for Serial ${serial} fully approved! Leave Balance updated.`);
    } else {
        showNotification(`Leave for Serial ${leaveEntries[index].serial} approved by ${currentUser.name}. Awaiting other approval.`);
    }
    saveData();
    displayLeave();
    displayLeaveBalance();
    displayStatistics();
    displayGroupCombination(currentGroupTab);
}

// Show Delete Confirmation Modal
function showDeleteModal(type, index, message) {
    if (!currentUser || currentUser.position > 2) {
        alert('Only employees with Position 1 to 2 can delete entries.');
        return;
    }
    const modal = document.getElementById('deleteModal');
    const deleteMessage = document.getElementById('deleteMessage');
    const confirmDelete = document.getElementById('confirmDelete');
    const cancelDelete = document.getElementById('cancelDelete');

    deleteMessage.textContent = message;
    modal.style.display = 'block';

    confirmDelete.onclick = function() {
        if (type === 'overtime') {
            overtimeEntries.splice(index, 1);
            displayOvertime();
            displayOvertimeBalance();
            displayStatistics();
            displayGroupCombination(currentGroupTab);
        } else if (type === 'leave') {
            leaveEntries.splice(index, 1);
            displayLeave();
            displayLeaveBalance();
            displayStatistics();
            displayGroupCombination(currentGroupTab);
                  } else if (type === 'employee') {
            deleteEmployee(index);
        }
        saveData();
        modal.style.display = 'none';
    };

    cancelDelete.onclick = function() {
        modal.style.display = 'none';
    };
}

// Calculate Total Leave Taken for an Employee (Fully Approved "Count" leaves only)
function calculateTotalLeaveTaken(serial) {
    return leaveEntries
        .filter(entry => entry.serial === serial && entry.leaveType === 'Count' && entry.fullyApproved)
        .reduce((total, entry) => total + entry.leaveDays, 0);
}

// Display Leave Balance with Total Leave and Approval System
function displayLeaveBalance() {
    const leaveBalanceList = document.getElementById('leaveBalanceList');
    leaveBalanceList.innerHTML = '<h3>Leave Balances</h3>';
    const canEdit = currentUser && currentUser.position <= 2;

    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>Position</th>
                    <th>Name</th>
                    <th>Group</th>
                    <th>Leave Taken</th>
                    <th>Total Leave</th>
                    <th>Leave Balance</th>
                </tr>
            </thead>
            <tbody>
    `;

    employees.sort((a, b) => a.position - b.position);
    employees.forEach(emp => {
        const fixedBalance = leaveBalances[emp.serial] || 0;
        const leaveTaken = calculateTotalLeaveTaken(emp.serial);
        const totalLeave = fixedBalance + leaveTaken;
        const pendingLeaveEdit = pendingLeaveEdits[emp.serial];
        const canApproveLeave = canEdit && pendingLeaveEdit && !pendingLeaveEdit.approvals[currentUser.position];
        const canDeleteLeave = canEdit && pendingLeaveEdit;

        tableHTML += `
            <tr>
                <td data-label="Position">${emp.position}</td>
                <td data-label="Name">${emp.name.padEnd(10, ' ')}</td>
                <td data-label="Group">${emp.group}</td>
                <td data-label="Leave Taken">${leaveTaken}</td>
                <td data-label="Total Leave">${totalLeave}</td>
                <td data-label="Leave Balance">
                    ${pendingLeaveEdit ? `Pending: ${pendingLeaveEdit.value} (Approved by: ${Object.values(pendingLeaveEdit.approvals).filter(Boolean).length}/2)` : 
                    (canEdit ? `<input type="number" value="${fixedBalance}" onchange="updateLeaveBalance(${emp.serial}, this.value)">` : `${fixedBalance}`)}
                    ${canApproveLeave ? `<button onclick="approveLeaveEdit(${emp.serial})"><i class="fas fa-check"></i> Approve</button>` : ''}
                    ${canDeleteLeave ? `<button class="delete" onclick="deleteLeaveEdit(${emp.serial})"><i class="fas fa-trash"></i> Delete</button>` : ''}
                </td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;
    leaveBalanceList.innerHTML += tableHTML;
}

// Update Leave Balance with Approval
function updateLeaveBalance(serial, value) {
    if (!currentUser || currentUser.position > 2) {
        alert('Only employees with Position 1 or 2 can modify leave balances.');
        return;
    }
    const newValue = parseInt(value) || 0;
    const currentValue = leaveBalances[serial] || 0;
    if (newValue !== currentValue) {
        pendingLeaveEdits[serial] = {
            value: newValue,
            approvals: { 1: currentUser.position === 1, 2: currentUser.position === 2 }
        };
        saveData();
        displayLeaveBalance();
        showNotification(`Leave balance edit for Serial ${serial} submitted for approval (New value: ${newValue}).`);
    }
}

// Approve Leave Balance Edit
function approveLeaveEdit(serial) {
    if (!currentUser || currentUser.position > 2) {
        alert('Only employees with Position 1 or 2 can approve leave balance edits.');
        return;
    }
    const edit = pendingLeaveEdits[serial];
    if (!edit) return;
    edit.approvals[currentUser.position] = true;
    if (Object.values(edit.approvals).every(status => status)) {
        leaveBalances[serial] = edit.value;
        delete pendingLeaveEdits[serial];
        saveData();
        showNotification(`Leave balance edit for Serial ${serial} fully approved (New value: ${edit.value}).`);
    } else {
        showNotification(`Leave balance edit for Serial ${serial} approved by ${currentUser.name}. Awaiting other approval.`);
        saveData();
    }
    displayLeaveBalance();
    displayStatistics();
    displayGroupCombination(currentGroupTab);
}

// Delete Pending Leave Balance Edit
function deleteLeaveEdit(serial) {
    if (!currentUser || currentUser.position > 2) {
        alert('Only employees with Position 1 or 2 can delete leave balance edits.');
        return;
    }
    if (pendingLeaveEdits[serial]) {
        delete pendingLeaveEdits[serial];
        saveData();
        showNotification(`Pending Leave balance edit for Serial ${serial} deleted.`);
        displayLeaveBalance();
    }
}

// Update Search Employee Dropdown
function updateSearchEmployeeDropdown() {
    const searchEmployeeSelect = document.getElementById('searchEmployee');
    searchEmployeeSelect.innerHTML = '<option value="" disabled selected>Select Employee</option>';
    employees.sort((a, b) => a.position - b.position);
    employees.forEach(emp => {
        const option = document.createElement('option');
        option.value = emp.serial;
        option.text = `${emp.position}. ${emp.name} (${emp.group})`;
        searchEmployeeSelect.appendChild(option);
    });
}

// Perform Search with Extended Search Types
function performSearch(event) {
    event.preventDefault();
    const serial = parseInt(document.getElementById('searchEmployee').value);
    const searchType = document.getElementById('searchType').value;
    const startDate = document.getElementById('searchStartDate').value;
    const endDate = document.getElementById('searchEndDate').value;
    const searchYear = document.getElementById('searchYear').value;
    const emp = employees.find(e => e.serial === serial);
    const resultsDiv = document.getElementById('searchResults');
    resultsDiv.innerHTML = `<h3>Search Results for ${emp.name} (${startDate} to ${endDate})</h3>`;

    if (new Date(endDate) < new Date(startDate)) {
        alert('End Date must be after Start Date!');
        return;
    }

    const allOvertime = JSON.parse(localStorage.getItem(`overtime_${searchYear}`)) || [];
    const allLeave = JSON.parse(localStorage.getItem(`leave_${searchYear}`)) || [];

    let filteredOvertime = [];
    let filteredLeave = [];
    let totalPanelOT = 0;
    let totalFieldOT = 0;
    let totalFreeOT = 0;
    let totalCCL = 0;
    let totalLeave = 0;
    let totalFreeLeave = 0;

    filteredOvertime = allOvertime.filter(entry => {
        const entryDate = new Date(entry.date);
        return entry.serial === serial && entry.fullyApproved && entryDate >= new Date(startDate) && entryDate <= new Date(endDate);
    });

    filteredLeave = allLeave.filter(entry => {
        const entryStart = new Date(entry.startDate);
        const entryEnd = new Date(entry.endDate);
        const rangeStart = new Date(startDate);
        const rangeEnd = new Date(endDate);
        return entry.serial === serial && entry.fullyApproved && entryStart <= rangeEnd && entryEnd >= rangeStart;
    });

    switch (searchType) {
        case 'overtime':
            totalPanelOT = filteredOvertime
                .filter(entry => entry.type === 'Panel')
                .reduce((sum, entry) => sum + entry.totalOTValue, 0);
            totalFieldOT = filteredOvertime
                .filter(entry => entry.type === 'Field')
                .reduce((sum, entry) => sum + entry.totalOTValue, 0);
            totalFreeOT = filteredOvertime
                .filter(entry => entry.type === 'Free')
                .reduce((sum, entry) => sum + entry.count, 0);
            resultsDiv.innerHTML += `<p><strong>Panel OT:</strong> ${totalPanelOT} | <strong>Field OT:</strong> ${totalFieldOT} | <strong>Free OT:</strong> ${totalFreeOT}</p>`;
            filteredOvertime.forEach(entry => {
                const cclLabel = entry.isCCL ? ' (CCL: 1)' : '';
                resultsDiv.innerHTML += `
                    <p>${emp.position}. ${emp.name.padEnd(10, ' ')} ${emp.group} - ${entry.date} - ${entry.type} - ${entry.category}${cclLabel}</p>`;
            });
            break;

        case 'panelOvertime':
            filteredOvertime = filteredOvertime.filter(entry => entry.type === 'Panel');
            totalPanelOT = filteredOvertime.reduce((sum, entry) => sum + entry.totalOTValue, 0);
            resultsDiv.innerHTML += `<p><strong>Panel OT:</strong> ${totalPanelOT}</p>`;
            filteredOvertime.forEach(entry => {
                const cclLabel = entry.isCCL ? ' (CCL: 1)' : '';
                resultsDiv.innerHTML += `
                    <p>${emp.position}. ${emp.name.padEnd(10, ' ')} ${emp.group} - ${entry.date} - ${entry.type} - ${entry.category}${cclLabel}</p>`;
            });
            break;

        case 'freeOvertime':
            filteredOvertime = filteredOvertime.filter(entry => entry.type === 'Free');
            totalFreeOT = filteredOvertime.reduce((sum, entry) => sum + entry.count, 0);
            resultsDiv.innerHTML += `<p><strong>Free OT:</strong> ${totalFreeOT}</p>`;
            filteredOvertime.forEach(entry => {
                resultsDiv.innerHTML += `
                    <p>${emp.position}. ${emp.name.padEnd(10, ' ')} ${emp.group} - ${entry.date} - ${entry.type} - ${entry.category}</p>`;
            });
            break;

        case 'ccl':
            filteredOvertime = filteredOvertime.filter(entry => entry.isCCL);
            totalCCL = filteredOvertime.length;
            resultsDiv.innerHTML += `<p><strong>Total CCL:</strong> ${totalCCL}</p>`;
            filteredOvertime.forEach(entry => {
                resultsDiv.innerHTML += `
                    <p>${emp.position}. ${emp.name.padEnd(10, ' ')} ${emp.group} - ${entry.date} - ${entry.type} - ${entry.category} (CCL: 1)</p>`;
            });
            break;

        case 'leave':
            totalLeave = filteredLeave.reduce((sum, entry) => sum + entry.leaveDays, 0);
            totalFreeLeave = filteredLeave
                .filter(entry => entry.leaveType === 'Free')
                .reduce((sum, entry) => sum + entry.leaveDays, 0);
            resultsDiv.innerHTML += `<p><strong>Total Leave:</strong> ${totalLeave} | <strong>Total Free Leave:</strong> ${totalFreeLeave}</p>`;
            filteredLeave.forEach(entry => {
                resultsDiv.innerHTML += `
                    <p>${emp.position}. ${emp.name.padEnd(10, ' ')} ${emp.group} - ${entry.startDate} to ${entry.endDate} - ${entry.leaveType} - ${entry.leaveDays} days</p>`;
            });
            break;

        case 'leaveDrain':
            filteredLeave = filteredLeave.filter(entry => entry.leaveType === 'Free');
            totalFreeLeave = filteredLeave.reduce((sum, entry) => sum + entry.leaveDays, 0);
            resultsDiv.innerHTML += `<p><strong>Total Leave Drain (Free):</strong> ${totalFreeLeave}</p>`;
            filteredLeave.forEach(entry => {
                resultsDiv.innerHTML += `
                    <p>${emp.position}. ${emp.name.padEnd(10, ' ')} ${emp.group} - ${entry.startDate} to ${entry.endDate} - ${entry.leaveType} - ${entry.leaveDays} days</p>`;
            });
            break;
    }

    if (filteredOvertime.length === 0 && filteredLeave.length === 0) {
        resultsDiv.innerHTML += '<p>No fully approved results found in this date range.</p>';
    }
}

// Display Fresh Statistics with Total Leave
function displayStatistics() {
    const statsList = document.getElementById('statsList');
    statsList.innerHTML = `<h3>Employee Statistics (${currentFinancialYear})</h3>`;
    employees.sort((a, b) => a.position - b.position);
    employees.forEach(emp => {
        const panelOT = overtimeEntries
            .filter(entry => entry.serial === emp.serial && entry.type === 'Panel' && entry.fullyApproved)
            .length;
        const fieldOT = overtimeEntries
            .filter(entry => entry.serial === emp.serial && entry.type === 'Field' && entry.fullyApproved)
            .length;
        const freeOT = overtimeEntries
            .filter(entry => entry.serial === emp.serial && entry.type === 'Free' && entry.fullyApproved)
            .length;
        const leaveDrain = leaveEntries
            .filter(entry => entry.serial === emp.serial && entry.leaveType === 'Free' && entry.fullyApproved)
            .reduce((sum, entry) => sum + entry.leaveDays, 0);
        const ccl = overtimeEntries
            .filter(entry => entry.serial === emp.serial && entry.isCCL && entry.fullyApproved)
            .length;
        const leaveTaken = calculateTotalLeaveTaken(emp.serial);
        const totalLeave = (leaveBalances[emp.serial] || 0) + leaveTaken;

        statsList.innerHTML += `
            <p>
                ${emp.position}. ${emp.name.padEnd(10, ' ')} ${emp.group} - Panel OT: ${panelOT} - Field OT: ${fieldOT} - Free OT: ${freeOT} - Total Leave: ${totalLeave} - Leave Drain: ${leaveDrain} - CCL: ${ccl}
            </p>`;
    });
}

// Open Group Combination Sub-Tab
function openGroupTab(groupCombo) {
    currentGroupTab = groupCombo;
    const subTabButtons = document.getElementsByClassName('sub-tab-nav')[0].getElementsByTagName('button');
    for (let btn of subTabButtons) {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick') === `openGroupTab('${groupCombo}')`) {
            btn.classList.add('active');
        }
    }
    displayGroupCombination(currentGroupTab);
}

// Display Group Combination with Rankings
function displayGroupCombination(groupCombo) {
    const groupComboList = document.getElementById('groupComboList');
    groupComboList.innerHTML = `<h3>Group ${groupCombo} (${currentFinancialYear})</h3>`;
    const [group1, group2] = groupCombo.split('');
    const filteredEmployees = employees.filter(emp => emp.group === group1 || emp.group === group2);

    const employeeStats = filteredEmployees.map(emp => {
        const panelOT = overtimeEntries
            .filter(entry => entry.serial === emp.serial && entry.type === 'Panel' && entry.fullyApproved)
            .length;
        const fieldOT = overtimeEntries
            .filter(entry => entry.serial === emp.serial && entry.type === 'Field' && entry.fullyApproved)
            .length;
        const freeOT = overtimeEntries
            .filter(entry => entry.serial === emp.serial && entry.type === 'Free' && entry.fullyApproved)
            .length;
        return { name: emp.name, position: emp.position, panelOT, fieldOT, freeOT };
    });

    groupComboList.innerHTML += '<h4>Employee Stats</h4>';
    employeeStats.sort((a, b) => a.position - b.position);
    employeeStats.forEach(stat => {
        groupComboList.innerHTML += `
            <p>${stat.position}. ${stat.name.padEnd(10, ' ')} - Panel OT: ${stat.panelOT} - Field OT: ${stat.fieldOT} - Free OT: ${stat.freeOT}</p>`;
    });

    const sortedPanelOT = [...employeeStats].sort((a, b) => a.panelOT - b.panelOT);
    const sortedFieldOT = [...employeeStats].sort((a, b) => a.fieldOT - b.fieldOT);
    const rankLabels = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th', '13th', '14th', '15th'];

    let panelRankings = [];
    let currentPanelRank = 0;
    sortedPanelOT.forEach((stat, index) => {
        if (index > 0 && stat.panelOT !== sortedPanelOT[index - 1].panelOT) {
            currentPanelRank++;
        }
        panelRankings.push({ rank: rankLabels[currentPanelRank], name: stat.name, value: stat.panelOT });
    });

    let fieldRankings = [];
    let currentFieldRank = 0;
    sortedFieldOT.forEach((stat, index) => {
        if (index > 0 && stat.fieldOT !== sortedFieldOT[index - 1].fieldOT) {
            currentFieldRank++;
        }
        fieldRankings.push({ rank: rankLabels[currentFieldRank], name: stat.name, value: stat.fieldOT });
    });

    groupComboList.innerHTML += '<h4>Rankings</h4>';
    panelRankings.forEach(ranking => {
        groupComboList.innerHTML += `<p>${ranking.rank} Term Panel: ${ranking.name} (${ranking.value})</p>`;
    });
    fieldRankings.forEach(ranking => {
        groupComboList.innerHTML += `<p>${ranking.rank} Term Field: ${ranking.name} (${ranking.value})</p>`;
    });

    if (filteredEmployees.length === 0) {
        groupComboList.innerHTML += '<p>No employees found in this group combination.</p>';
    }
}

// Generate Monthly Report in PDF
function generateMonthlyReport() {
    const month = prompt("Enter month (e.g., 2025-02 for February 2025):");
    if (!month || !month.match(/^\d{4}-\d{2}$/)) {
        alert('Please enter a valid month (YYYY-MM format).');
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text(`Monthly Report - ${month} (${currentFinancialYear})`, 10, 10);

        const headers = ['Position', 'Name', 'Group', 'Panel OT', 'Field OT', 'Free OT', 'Leave Drain', 'CCL', 'Date'];
        let rows = [];
        employees.sort((a, b) => a.position - b.position);
        employees.forEach(emp => {
            const empOvertime = overtimeEntries.filter(entry => entry.serial === emp.serial && entry.fullyApproved && entry.date.startsWith(month));
            const empLeave = leaveEntries.filter(entry => entry.serial === emp.serial && entry.fullyApproved && entry.startDate.startsWith(month));
            
            const panelOT = empOvertime.filter(entry => entry.type === 'Panel').length;
            const fieldOT = empOvertime.filter(entry => entry.type === 'Field').length;
            const freeOT = empOvertime.filter(entry => entry.type === 'Free').length;
            const leaveDrain = empLeave.filter(entry => entry.leaveType === 'Free').reduce((sum, entry) => sum + entry.leaveDays, 0);
            const ccl = empOvertime.filter(entry => entry.isCCL).length;

            empOvertime.forEach(entry => {
                rows.push([emp.position, emp.name, emp.group, entry.type === 'Panel' ? 1 : 0, entry.type === 'Field' ? 1 : 0, entry.type === 'Free' ? 1 : 0, 0, entry.isCCL ? 1 : 0, entry.date]);
            });
            empLeave.forEach(entry => {
                rows.push([emp.position, emp.name, emp.group, 0, 0, 0, entry.leaveType === 'Free' ? entry.leaveDays : 0, 0, `${entry.startDate} to ${entry.endDate}`]);
            });
            if (empOvertime.length === 0 && empLeave.length === 0) {
                rows.push([emp.position, emp.name, emp.group, panelOT, fieldOT, freeOT, leaveDrain, ccl, '-']);
            }
        });

        doc.autoTable({
            head: [headers],
            body: rows,
            startY: 20,
            styles: { fontSize: 10 },
            columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 30 }, 2: { cellWidth: 15 } }
        });

        doc.save(`Monthly_Report_${month}.pdf`);
    } catch (error) {
        console.error('PDF generation error:', error);
        alert('Failed to generate PDF. Please check the console for details.');
    }
}
