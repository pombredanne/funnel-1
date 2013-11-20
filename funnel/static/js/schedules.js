function hexToRgb(hex) {
    if(hex.charAt(0) != "#") hex = "#" + hex;
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
    });

    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function componentToHex(c) {
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
}

function rgbToHex(color) {
    return "#" + componentToHex(color.r) + componentToHex(color.g) + componentToHex(color.b);
}

function invert(color) {
    color = hexToRgb(color);
    avg = (color.r + color.g + color.b) / 3;
    avg = ((Math.round(avg / 256) + 1) % 2) * 255;
    color = {r: avg, g: avg, b: avg};
    return rgbToHex(color);
}

toastr.options = {
    positionClass: 'toast-bottom-right'
};

$(function() {

    var settings = function() {
        var settings = {
            editable: EDIT_EVENTS,
            container: $('#settings'),
            color_form: $('#room_colors'),
            onColorChange: function(color) {
                ROOMS[$(this).attr('data-room-id')].bgcolor = color.toHexString();
                calendar.render();
            },
            init: function() {
                if(this.editable) {
                    this.color_form.find('input[type=text]').each(function() {
                        $(this).spectrum({
                            showInitial: true,
                            hide: settings.onColorChange,
                            move: settings.onColorChange,
                            change: settings.onColorChange
                        });
                    });
                    this.color_form.find('input[type=reset]').click(function() {
                        settings.color_form.find('input[type=text]').each(function() {
                            ROOMS[$(this).attr('data-room-id')].bgcolor = $(this).attr('data-color');
                            $(this).spectrum("set", $(this).attr('data-color'));
                        });
                        calendar.render();
                    });
                    this.color_form.submit(function() {
                        var data = $(this).serializeArray();
                        $.ajax({
                            url: COLORS_UPDATE_URL,
                            type: 'POST',
                            data: data,
                            success: function(result) {
                                toastr.success("The colors have been updated.")
                            },
                            complete: function(xhr, type) {
                                if(type == 'error' || type == 'timeout') {
                                    toastr.error("There was a problem in contacting the server. Please try again later.");
                                }
                            }
                        });
                    });
                }
            }
        };
        return settings;
    }();

    var popup = function() {
        var obj = {};
        var popup = {
            container: $('#popup'),
            title: function() {return this.container.find('.modal-title')},
            body: function() {return this.container.find('.modal-body')},
            options: {
                backdrop: 'static',
                keyboard: false
            },
            pop: function() {this.container.modal(this.options);},
            hide: function() {this.container.modal('hide');},
            close: function() {
                if(settings.editable) if(events.current.unscheduled) calendar.remove(events.current);
                events.current = null;
            }
        };

        if(settings.editable) {
            popup.form = function(input) {
                if(typeof input == 'undefined') return this.container.find('form');
                else return this.form().find('[name=' + input + ']');
            };
            popup.save = function() {
                popup.form('start').val(events.current.obj_data.start);
                popup.form('end').val(events.current.obj_data.end);
                var data = popup.form().serializeArray();
                $.ajax({
                    url: events.current.modal_url,
                    type: 'POST',
                    data: data,
                    success: function(result) {
                        if(result.status) {
                            events.update_obj_data(result.data);
                            events.current.title = result.data.title;
                            events.current.saved = true;
                            if(events.current.unscheduled) {
                                events.current.unscheduled.remove();
                                events.current.unscheduled = null;
                            }
                            calendar.update(events.current);
                            popup.hide();
                        }
                        else {
                            popup.body().html(result.form);
                        }
                    },
                    complete: function(xhr, type) {
                        if(type == 'error' || type == 'timeout') {
                            toastr.error('There was a problem in contacting the server. Please try again.');
                        }
                    }
                });
            };
            popup.close = function() {
                if(events.current.unscheduled) {
                    calendar.remove(events.current);
                    events.current = null;
                }
            };
        }

        obj.open = function() {
            $.ajax({
                url: events.current.modal_url,
                type: 'GET',
                success: function(result) {
                    popup.title().text(events.current.title);
                    popup.pop();
                    popup.body().html(result);
                },
                complete: function(xhr, type) {
                    if(type == 'error' || type == 'timeout') {
                        popup.close();
                        toastr.error('There was a problem in contacting the server. Please try again later.');
                    }
                }
            });
        };

        obj.init = function() {
            popup.container.find('.close').click(popup.close);
            popup.container.find('.save').click(popup.save);
        };

        return obj;
    }();

    var calendar = function() {
        var calendar = {
            container: $('#calendar'),
            helpers: {
                date_diff: function(from, to) {return (to.valueOf() - from.valueOf())/3600/24000;},
                inactive_days: function(from, to) {
                    var diff = calendar.helpers.date_diff(from,to);
                    if(diff >= 7) return [];
                    else {
                        var from_day = from.getDay(), to_day = to.getDay();
                        var inactive = [];
                        for(i=0; i <= 6; i++) {if(i == from_day) i = to_day;else inactive.push(i);}
                        return inactive;
                    }
                }
            },
            options: {
                config: {
                    header: {
                        left: '',
                        center: 'title',
                        right: ''
                    },
                    allDayDefault: false,
                    firstDay: 1, //Start from Monday, if not modified
                    defaultView: 'agendaWeek',
                    allDaySlot: false,
                    slotMinutes: 15,
                    defaultEventMinutes: 45,
                    firstHour: 8,
                    slotEventOverlap: false,
                    eventColor: "#229922",
                    eventTextColor: "#FFFFFF",
                    columnFormat: {
                        month: 'ddd',  // Mon
                        week: 'ddd d', // Mon 31
                        day: 'dddd d'  // Monday 31
                    }
                },
                init: function(scheduled) {
                    var config = calendar.options.config;
                    config.events = scheduled;
                    if(from_date != null) {
                        config.year = from_date.getFullYear();
                        config.month = from_date.getMonth();
                        config.date = from_date.getDate();
                        if(to_date != null) {
                            config.hiddenDays = calendar.helpers.inactive_days(from_date, to_date);
                            config.firstDay = from_date.getDay();
                        }
                    };
                    config.eventClick = events.onClick;
                    if(settings.editable) config.eventResize = config.eventDrop = events.onChange;
                }
            },
            init_obj: {id: null, start: null, end: null, title: null, is_break: null},
            add: function(event) {
                this.container.fullCalendar('renderEvent', event, true);
                events.add_obj_data(event);
            },
            filters: {
                unsaved: function(event) {return !event.saved;},
                get_by_id: function(event) {return event._id == calendar.temp.get_by_id;}
            },
            events: function(filter, args) {
                if(typeof filter == 'string') {
                    calendar.temp[filter] = args;
                    var return_data = calendar.container.fullCalendar('clientEvents', calendar.filters[filter]);
                    delete calendar.temp[filter];
                    return return_data;
                }
                if(typeof filter == 'function') return this.container.fullCalendar('clientEvents', filter);
                return this.container.fullCalendar('clientEvents');
            },
            init: function(scheduled) {
                this.options.init(scheduled);
                this.container.fullCalendar(this.options.config);
                init_buttons();
                init_autosave();
                events.height(this.container.find('.fc-content').height());
                $('#rooms-list').height(this.container.find('.fc-content').height());
                var rooms_list = $('#rooms-list').find('.room .title');
                rooms_list.each(function() {
                    $(this).css({'background': $(this).attr('data-bgcolor'), 'color': invert($(this).attr('data-bgcolor'))});
                })
            },
            temp: {}
        };

        var obj = {};
        var buttons = {};

        if(settings.editable) {
            var config = calendar.options.config;
            config.selectable = true;
            config.editable = true;
            config.droppable = true;
            config.select = function(startDate, endDate, allDay, jsEvent, view) {
                $('body').append('<div id="dummy"></div>');
                var event = {
                    saved: false,
                    modal_url: NEW_SESSION_URL,
                    start: startDate,
                    end: endDate,
                    title: "Add new session",
                    unscheduled: $('body #dummy')
                };
                calendar.add(event);
                popup.open(event);
                calendar.container.fullCalendar('unselect');
            };
            config.drop = function(date, allDay) {
                // we need to clone it, else we will lose it when we remove the source's DOM element
                var source = $(this);
                var _event = source.data('info');
                var event = $.extend({}, _event);
                // assign it the date that was reported
                event.start = date;
                event.end = new Date(date.getTime());
                event.end.setMinutes(event.end.getMinutes() + calendar.options.config.defaultEventMinutes);
                event.unscheduled = source;
                calendar.add(event);
                popup.open(event);
            };
            config.viewRender = function() {
                event_list = calendar.events();
                for(e in event_list) {
                    events.update_properties(event_list[e]);
                }
            };
            
            obj.remove = function(event) {
                calendar.container.fullCalendar('removeEvents', event._id);
            };

            obj.update = function(event) {
                calendar.container.fullCalendar('updateEvent', event);
            };
        }

        obj.events = calendar.events;

        obj.init = function(scheduled) {
            from_date = new Date(from_date);
            to_date = new Date(to_date);
            calendar.init(scheduled);
            popup.init();
        };

        var init_buttons = function() {
            if(settings.editable) {
                buttons.save = function() {
                    calendar.container.find('.fc-header-right').append('<span class="hg-fc-button save-schedule">Save</span>');
                    var button = calendar.container.find('.save-schedule');
                    button.enable = function(label) {
                        $(this).removeClass('fc-state-disabled');
                        button.setlabel(label);
                    };
                    button.setlabel = function(label) {
                        if(typeof label == 'string') $(this).text(label);
                    }
                    button.disable = function(label) {
                        $(this).addClass('fc-state-disabled');
                        button.setlabel(label);
                    };
                    button.disabled = function() {
                        return $(this).hasClass('fc-state-disabled');
                    };
                    button.click(function() {
                        if(!button.disabled()) events.save();
                    })
                    button.disable('Saved');
                    return button;
                }();
            }
            calendar.container.find('.hg-fc-button')
                .addClass('fc-button fc-state-default fc-corner-left fc-corner-right')
                .attr('unselectable', 'on').hover(
                    function(){
                        $(this).addClass('fc-state-hover');
                    }, function() {
                        $(this).removeClass('fc-state-hover');
                    }
                );
        };

        obj.render = function() {
            calendar.container.fullCalendar('render');
        };

        var init_autosave = function() {
            if(settings.editable) {
                calendar.container.find('.fc-header-right')
                    .prepend('<label for="autosaver" class="fc-button fc-state-disabled fc-corner-right fc-corner-left"><input id="autosaver" class="autosave" type="checkbox"> Autosave</label> ');
                var autosaver = calendar.container.find('.autosave');
                autosaver.prop('checked', events.autosave);
                autosaver.change(function() {
                    events.autosave = $(this).is(':checked');
                });
            }
        };

        obj.buttons = buttons;

        return obj;

    }();
    var events = function() {
        var events = {
            current: null,
            autosave: true,
            init_obj: {id: null, start: null, end: null, title: null},
            add_obj_data: function(event) {
                if(typeof event != 'undefined') this.current = event;
                if(this.current) {
                    obj_data = $.extend({}, this.init_obj);
                    obj_data = $.extend(obj_data, this.current.obj_data);                    
                    this.current.obj_data = obj_data;
                    this.update_time();
                    this.update_properties();
                };
            },
            update_obj_data: function(obj, event) {
                if(typeof event != 'undefined') this.current = event;
                if(typeof obj != 'object') return;
                if(this.current) {
                    $.extend(this.current.obj_data, obj);
                    this.current.modal_url = this.current.obj_data.modal_url;
                    delete this.current.obj_data.modal_url;
                    this.update_properties();
                }
            },
            update_properties: function(event) {
                if(typeof event != 'undefined') this.current = event;
                if(this.current.obj_data.is_break) {
                    this.current.color = BREAK_EVENTS_COLOR;
                    this.current.textColor = invert(this.current.color);
                }
                else if(this.current.obj_data.scoped_name) {
                    this.current.color = ROOMS[this.current.obj_data.scoped_name].bgcolor;
                    if(this.current.color.charAt(0) != "#") this.current.color = "#" + this.current.color;
                    this.current.textColor = invert(this.current.color);
                }
                else {
                    delete this.current.color;
                    delete this.current.textColor;
                }
            },
            update_time: function(event) {
                if(typeof event != 'undefined') this.current = event;
                if(this.current) {
                    this.current.obj_data.end = this.current.end.valueOf();
                    this.current.obj_data.start = this.current.start.valueOf();
                }
            },
            height: function(ht) {
                if(settings.editable) unscheduled_events.container.height(ht);
            },
            onClick: function(event, jsEvent, view) {
                events.current = event;
                popup.open();
            }
        };

        if(settings.editable) {
            events.onChange = function(event, jsEvent, ui, view) {
                event.saved = false;
                events.update_time(event);
                calendar.buttons.save.enable('Save');
                if(events.autosave) events.save();
            };
            events.save = function() {
                calendar.buttons.save.disable('Saving...');
                var event_list = calendar.events('unsaved');
                var e = [];
                for(event in event_list) {
                    e.push(event_list[event].obj_data);
                }
                $.ajax({
                    url: UPDATE_URL,
                    type: 'POST',
                    data: [{name: 'sessions', value: JSON.stringify(e)}],
                    success: function(result) {
                        for(event in event_list) event_list[event].saved = true;
                        calendar.buttons.save.disable('Saved');
                    },
                    complete: function(xhr, type) {
                        if(type == 'error' || type =='timeout') {
                            calendar.buttons.save.enable('Save');
                            toastr.error(
                                'There was a problem in contacting the server. There are '
                                + e.length + ' unsaved sessions. Please try again later.'
                                );
                        }
                    }
                })
            };

            var unscheduled_events = {
                container: $('#proposals .list'),
                add: function(element) {
                    element.draggable(this.options.draggable);
                    element.data('info', {
                        saved: false,
                        modal_url: element.attr('data-modal-url'),
                        title: $.trim(element.text())
                    });
                },
                options: {
                    draggable: {
                        zIndex: 5999,
                        revert: true,
                        revertDuration: 0,
                        helper: 'clone',
                        appendTo: 'body'
                    }
                }
            };
            unscheduled_events.container.find('.unscheduled').each(function() {
                unscheduled_events.add($(this));
            });
        }

        for(i in scheduled) {
            scheduled[i] = {
                start: new Date(scheduled[i].start),
                end: new Date(scheduled[i].end),
                modal_url: scheduled[i].modal_url,
                title: scheduled[i].title,
                saved: true,
                unscheduled: null,
                obj_data: scheduled[i]
            };
            events.update_properties(scheduled[i]);
            delete scheduled[i].obj_data.modal_url;
        }

        return events;

    }();

    settings.init();
    calendar.init(scheduled);
});