package lab;

@:native("NailEditor")
extern class NailEditor {
  public static function mount(elementId:String, initial:String, onChange:String->Void):Void;
  public static function getValue():String;
  public static function setValue(value:String):Void;
  public static function focus():Void;
}

@:native("NailStorage")
extern class NailStorage {
  public static function load(key:String):js.lib.Promise<Null<String>>;
  public static function save(key:String, value:String):js.lib.Promise<Bool>;
}
