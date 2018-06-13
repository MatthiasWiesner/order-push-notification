var Broker = function(host, port, topic, client, consumerOnMessageArrived){
    _broker = this;
    _broker.topic = topic;
    _broker.consumerOnMessageArrived = consumerOnMessageArrived;

    this.init = function(host, port, client){
        // Create a client instance
        _broker.client = new Paho.MQTT.Client(host, Number(port), "clientId-" + client + "-" + new Date().getTime());
        _broker.client.onConnectionLost = _broker.onConnectionLost;
        _broker.client.onMessageArrived = _broker.onMessageArrived;
        // connect the client
        _broker.client.connect({onSuccess: _broker.onConnect});
    };

    // called when the client connects
    this.onConnect = function() {
        console.log(_broker);
        // Once a connection has been made, make a subscription.
        _broker.client.subscribe(_broker.topic);
    };

    // called when the client loses its connection
    this.onConnectionLost = function(responseObject) {
        if (responseObject.errorCode !== 0) {
            console.log("onConnectionLost:" + responseObject.errorMessage);
        }
    };

    this.onMessageArrived = function(message) {
        console.log("onMessageArrived:" + message.payloadString);
        if (typeof _broker.consumerOnMessageArrived === 'function'){
            _broker.consumerOnMessageArrived(JSON.parse(message.payloadString));
        }
    };

    this.sendMessage = function(data){
        var message = new Paho.MQTT.Message(JSON.stringify(data));
        message.destinationName = _broker.topic;
        _broker.client.send(message);
    };

    _broker.init(host, port, client);
};

var Order = function(table){
    _order = this;
    _order.table = table;
    _order.recipes = {};

    this.getGuid = function(){
        var S4 = function() {
            return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
        };
        return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
    };

    this.initDisplay = function(){
        $('#currentOrder').empty();
        var orderTemplate = $('#order-template').html();
        $('#currentOrder').append(Mustache.to_html(orderTemplate));
        $('#currentOrder').show();
        $('dd.table').html(_order.table);
    };

    this.updateRecipes = function(recipes){
        $('tbody', 'table#orderList').empty();
        var countIncreaseTemplate = $('#count-increase-template').html();
        var countDecreaseTemplate = $('#count-decrease-template').html();

        for(title in _order.recipes){
            $tr = $('<tr>');
            $tr.append($('<td>').html(title).addClass('w-50'));
            $tr.append($('<td>').html(_order.recipes[title]).addClass('w-10'));
            var $tdUpdate = $('<td>').addClass('w-40');
            $tdUpdate.append(Mustache.to_html(countIncreaseTemplate, {title: title}));
            $tdUpdate.append(Mustache.to_html(countDecreaseTemplate, {title: title}));

            $tr.append($tdUpdate);
            $('tbody', 'table#orderList').append($tr);
        }
        $('.count-increase').unbind('click').bind('click', function(){
            var title = $(this).attr('data-recipe-title');
            _order.addRecipe(title);
        });
        $('.count-decrease').unbind('click').bind('click', function(){
            var title = $(this).attr('data-recipe-title');
            _order.removeRecipe(title);
        });
    }

    this.addRecipe = function(title){
        if (_order.recipes[title] == undefined){
            _order.recipes[title] = 0;
        }
        _order.recipes[title] += 1;
        _order.updateRecipes();
    };

    this.removeRecipe = function(title){
        if (_order.recipes[title] == undefined){
            return false;
        }
        _order.recipes[title] -= 1;
        if (_order.recipes[title] < 1){
            delete _order.recipes[title];
        }
        _order.updateRecipes();
    };

    this.destruct = function(){
        $('#currentOrder').empty();
    };

    this.initDisplay();
    _order.id = _order.getGuid();
};

var Publisher = function(broker){
    _publisher = this;
    _publisher.broker = broker;
    _publisher.order;

    _publisher.recipeTemplate = $('#recipe-template').html();
    Mustache.parse(_publisher.recipeTemplate);

    _publisher.tableTemplate = $('#table-template').html();
    Mustache.parse(_publisher.tableTemplate);

    this.initRecipesTables = function(){
        $('#hiddenRecipes').empty();
        data.hidden_recipes.forEach(function(recipe){
            $('#hiddenRecipes').append($('<option>').text(recipe.title));
        });
        $('#customRecipeAdd').on('click', _publisher.addCustomRecipe);

        $('#tableList').empty();
        _publisher.displayTables();
        $('#tableList').show();

        $('#recipeList').empty();
        _publisher.displayRecipes();

        $('#sendOrder').hide();
    };
    
    this.initOrder = function(tableTitle){
        _publisher.order = new Order(tableTitle);
        $('#tableList').hide();
        $('#recipeList').show();
        $('#customRecipe').show();

        $('#sendOrder').unbind('click').bind('click', function(){
            var data = JSON.stringify(_publisher.order);
            _publisher.order.destruct();
            delete _publisher.order;

            _publisher.initRecipesTables();
            _publisher.broker.sendMessage(new Array(data));
        });
    };

    this.displayTables = function(){
        data.tables.forEach(function(table){
            var rendered = $(Mustache.render(_publisher.tableTemplate, {
            id: table.id,
                title: table.title
            }));
            $('#tableList').append(rendered);
            $('.add-table', '#tableList').unbind('click').bind('click', function(){
                _publisher.initOrder($(this).attr('data-table-title'))
            });
        });
    };

    this.displayRecipes = function(){
        data.recipes.forEach(function(recipe){
            var rendered = $(Mustache.render(_publisher.recipeTemplate, {
                id: recipe.id,
                title: recipe.title
            }));
            $('#recipeList').append(rendered);

            $('.add-recipe', '#recipeList').unbind('click').bind('click', _publisher.addRecipe);
        });

        $('#recipeList').hide();
        $('#customRecipe').hide();
    };

    this.addRecipe = function(){
        _publisher.order.addRecipe($(this).attr('data-recipe-title'));
        $('#sendOrder').show();
    };

    this.addCustomRecipe = function(){
        var title = $('#recipeTitle').val();
        if (title.length == 0){
            return;
        }

        var count = parseInt($('#recipeCount').val()) || 1;
        count = Math.max(1, count);

        $('#recipeTitle').val('');
        $('#recipeCount').val('');

        for(var i = 0; i < count; i++){
            _publisher.order.addRecipe(title);
            $('#sendOrder').show();
        }
    };
};

var Consumer = function(){
    this.displayOrders = function(data) {
        data.forEach(function(orderString){
            var order = JSON.parse(orderString);

            var orderTemplate = $('#order-template').html();
            var $order = $(Mustache.to_html(orderTemplate, {id: order.id}));

            $('dd.orderTable', $order).html(order.table);

            for(title in order.recipes){
                $tr = $('<tr>');
                $tr.append($('<td>').html(title).addClass('w-50'));
                $tr.append($('<td>').html(order.recipes[title]).addClass('w-10'));
                $('tbody', $order).append($tr);
            }
            $('button.order-ready', $order).on('click', function(){
                $('dl[data-order-id=' + order.id + ']').remove();
            });
            $('#orderList').append($order);
            var sound = new Howl({
                src: ['./sounds/bell_ring.mp3', './sounds/bell_ring.ogg', './sounds/bell_ring.aac'],
                volume: 1.5,
            });
            sound.play();
        });
    }
};