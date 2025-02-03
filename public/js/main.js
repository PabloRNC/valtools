window.onload = (() => {

    if(location.hash === "#afterLogin"){
        alert("You have successfully logged in!");
    }

    if(location.hash === "#noValorantAccount"){
        alert("You don't have any valorant data linked to this Riot Account. Try to play a match.");
    }

})

const tryButton = document.getElementById("tryButton");
const bugModal = document.getElementById("bugModal");
const reportBugButton = document.getElementById("reportBugButton");
const closeModal = document.getElementById("closeModal");
const bugForm = document.getElementById("bugForm");


tryButton.addEventListener("click", () => {
    window.open("https://dashboard.twitch.tv/extensions/ialonun7tinn2yo9fpkjgdqpu2vw9g-0.0.3");
});

reportBugButton.addEventListener("click", () => {
    bugModal.style.display = "flex";
});

closeModal.addEventListener("click", () => {
    bugModal.style.display = "none";
});

bugForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const description = document.getElementById("bugDescription").value;
    const reproduction = document.getElementById("bugReproduction").value;
    const frequency = document.getElementById("bugFrequency").value;
    const screenshot = document.getElementById("bugScreenshot").files[0];

    const captchaResponse = grecaptcha.getResponse();

    if (!captchaResponse) {
        alert("Please complete the CAPTCHA.");
        return;
    }

    const formData = new FormData();
    formData.append("description", description);
    formData.append("reproduction", reproduction);
    formData.append("frequency", frequency);
    formData.append("captcha", captchaResponse);

    if (screenshot) {
        formData.append("screenshot", screenshot);
    }

    const response = await fetch("/api/report", {
        method: "POST",
        body: formData
    });

    if (!response.ok) {
        alert("Failed to report the bug.");
        return;
    }


    alert("Bug reported successfully!");
    bugModal.style.display = "none";
});