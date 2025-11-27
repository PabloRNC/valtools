$(window).on("load", () => {

  const helper = window.Twitch?.ext;

  if(!helper) init();

  helper?.onAuthorized(async (data) => {
    const token = data.token;
    const channelId = data.channelId;

    console.log("The JWT that will be passed to the EBS is", token);
    console.log("The channel ID is", channelId);

    init();
  });
});

function init() {

   $(".navItem").on("click", function () {
      $(".navItem").each(function () {
        this.classList.remove("active");
        const triggerClass = $(this).data("trigger");
        if (triggerClass) {
          $(`.${triggerClass}`).addClass("inactive");
        }
      });

      this.classList.add("active");
      const activeTriggerClass = $(this).data("trigger");
      if (activeTriggerClass) {
        const $window = $(`.${activeTriggerClass}`);
        $window
          .removeClass("inactive")
          .css("opacity", 0)
          .animate({ opacity: 1 }, 400);
      }
    });

    $(".navItem.active").trigger("click");

    $(".pagination-arrow").on("mouseenter", function () {
      console.log("hover");
    });

    $(".pagination-arrow").on("click", function () {
      console.log("click");
    });

  for (const type of ["casualMatches", "rankedMatches"]) {
    let currentIndex = 0;

    console.log('peo')

    const matches = $(`.${type} .match`);
    $(`.${type} .pagination-text`).text(`1/${matches.length}`);

    $(`.${type} .pagination-arrow.left`).on("click", () => {
      if (currentIndex > 0) {
        currentIndex--;
        updatePagination(type, currentIndex, matches);
      }
    });

    $(`.${type} .pagination-arrow.right`).on("click", () => {
      if (currentIndex < matches.length - 1) {
        currentIndex++;
        updatePagination(type, currentIndex, matches);
      }
    });

    updatePagination(type, currentIndex, matches);
  }
}

function updatePagination(type, newIndex, matches) {
  matches.each((index, match) => {
    if (index === newIndex) {
      $(match).fadeIn(600).removeClass("inactive").css({ display: "flex" });
    } else {
      $(match).fadeOut(600).addClass("inactive");
    }
  });

  if (newIndex === 0) {
    $(`.${type} .pagination-arrow.left`).addClass("inactive");
  } else {
    $(`.${type} .pagination-arrow.left`).removeClass("inactive");
  }

  if (newIndex === matches.length - 1) {
    $(`.${type} .pagination-arrow.right`).addClass("inactive");
  } else {
    $(`.${type} .pagination-arrow.right`).removeClass("inactive");
  }

  $(`.${type} .pagination-text`).text(`${newIndex + 1}/${matches.length}`);
}
