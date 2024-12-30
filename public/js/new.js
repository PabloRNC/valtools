$(window).on('load', () => {
    $('.navItem').on('click', function () {
        $('.navItem').each(function () {
            this.classList.remove('active');
            const triggerClass = $(this).data('trigger');
            if (triggerClass) {
                $(`.${triggerClass}`).addClass('inactive');
            }
        });

        this.classList.add('active');
        const activeTriggerClass = $(this).data('trigger');
        if (activeTriggerClass) {
            $(`.${activeTriggerClass}`).removeClass('inactive');
        }
    });
});
