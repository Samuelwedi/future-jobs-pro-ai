import 'react-big-calendar';

declare module 'react-big-calendar' {
  interface CalendarProps<
    TEvent extends object = Event,
    TResource extends object = object
  > {
    draggableAccessor?: (event: TEvent) => boolean;
    onEventDrop?: (args: {
      event: TEvent;
      start: Date;
      end: Date;
      isAllDay: boolean;
    }) => void;
    resizableAccessor?: (event: TEvent) => boolean;
    onEventResize?: (args: {
      event: TEvent;
      start: Date;
      end: Date;
      isAllDay: boolean;
    }) => void;
  }
}